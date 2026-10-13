const DEFAULT_MAX_NODES = 10_000;
const DEFAULT_MAX_EXPRESSION_BYTES = 4_096;
const DEFAULT_MAX_DEPTH = 64;
const MAX_DIAGNOSTICS = 64;
const DYNAMIC_SCOPES = new Set(["arguments", "application", "attributes", "caller", "cgi", "client", "cookie", "form", "local", "request", "server", "session", "this", "url", "variables"]);
const MODIFIERS = new Set(["public", "private", "package", "remote", "static", "final", "abstract"]);
const wordStart = (value) => /^[\p{L}_$]$/u.test(value ?? "");
const wordPart = (value) => /^[\p{L}\p{N}\p{M}_$]$/u.test(value ?? "");

export function scanCfmlComment(text, start, end = text.length, maxDepth = DEFAULT_MAX_DEPTH) {
  let cursor = start;
  let depth = 0;
  while (cursor < end) {
    if (cursor + 5 <= end && text.startsWith("<!---", cursor)) {
      depth += 1;
      if (depth > maxDepth) return { next: end, code: "RESOURCE_LIMIT" };
      cursor += 5;
    } else if (cursor + 4 <= end && text.startsWith("--->", cursor)) {
      depth -= 1;
      cursor += 4;
      if (depth === 0) return { next: cursor, code: null };
    } else cursor += 1;
  }
  return { next: end, code: "PARSE_PARTIAL" };
}

export function isScriptCfcSource(text) {
  let cursor = 0;
  while (cursor < text.length) {
    if (/\s/u.test(text[cursor]) || text[cursor] === "\uFEFF") { cursor += 1; continue; }
    if (text.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < text.length && text[cursor] !== "\n" && text[cursor] !== "\r") cursor += 1;
      continue;
    }
    if (text.startsWith("<!---", cursor)) {
      const comment = scanCfmlComment(text, cursor);
      if (comment.code) return true;
      cursor = comment.next;
      continue;
    }
    const comment = text.startsWith("/*", cursor) ? [2, "*/"] : text.startsWith("<!--", cursor) ? [4, "-->"] : null;
    if (!comment) break;
    const close = text.indexOf(comment[1], cursor + comment[0]);
    if (close === -1) break;
    cursor = close + comment[1].length;
  }
  return cursor >= text.length || text[cursor] !== "<";
}

function sourceLocation(sourceMap, start, end) {
  return { span: sourceMap.spanFromTextOffsets(start, end), byte_start: sourceMap.textOffsetToByteOffset(start), byte_end: sourceMap.textOffsetToByteOffset(end) };
}

// CFML uses doubled quotes and hashes, not JavaScript backslash escaping.
// Interpolated expressions are kept inside the string token and never scanned as links.
function stringToken(text, start, end, maxValueCharacters = 0) {
  const quote = text[start];
  let cursor = start + 1;
  let value = "";
  let dynamic = false;
  function retain(character) {
    if (value !== null) value = value.length < maxValueCharacters ? value + character : null;
  }
  while (cursor < end) {
    const character = text[cursor];
    if (character === quote) {
      if (text[cursor + 1] === quote) { retain(quote); cursor += 2; continue; }
      return { type: "string", value, dynamic, start, end: cursor + 1 };
    }
    if (character === "#") {
      if (text[cursor + 1] === "#") { retain("#"); cursor += 2; continue; }
      dynamic = true;
      cursor += 1;
      let innerQuote = null;
      let closed = false;
      while (cursor < end) {
        const inner = text[cursor];
        if (innerQuote !== null) {
          if (inner === innerQuote) {
            if (text[cursor + 1] === innerQuote) { cursor += 2; continue; }
            innerQuote = null;
          }
        } else if (inner === "'" || inner === '"') innerQuote = inner;
        else if (inner === "#") { cursor += 1; closed = true; break; }
        cursor += 1;
      }
      if (!closed) return null;
      continue;
    }
    retain(character);
    cursor += 1;
  }
  return null;
}

export function findCfscriptClose(text, start, end = text.length) {
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] === "'" || text[cursor] === '"') {
      const token = stringToken(text, cursor, end);
      if (!token) return -1;
      cursor = token.end;
      continue;
    }
    if (text.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < end && text[cursor] !== "\r" && text[cursor] !== "\n") cursor += 1;
      continue;
    }
    if (text.startsWith("<!---", cursor)) {
      const comment = scanCfmlComment(text, cursor, end);
      if (comment.code) return -1;
      cursor = comment.next;
      continue;
    }
    const comment = text.startsWith("/*", cursor) ? [2, "*/"] : null;
    if (comment) {
      const close = text.indexOf(comment[1], cursor + comment[0]);
      if (close === -1 || close >= end) return -1;
      cursor = close + comment[1].length;
      continue;
    }
    if (text.slice(cursor, cursor + 10).toLowerCase() === "</cfscript" && (text[cursor + 10] === ">" || /\s/u.test(text[cursor + 10] ?? ""))) return cursor;
    cursor += 1;
  }
  return -1;
}

/** Private bounded structural parser; admitted syntax is deliberately smaller than CFML. */
export function scanCfscript(text, start, end, sourceMap, file, { maxNodes = DEFAULT_MAX_NODES, maxExpressionBytes = DEFAULT_MAX_EXPRESSION_BYTES, maxDepth = DEFAULT_MAX_DEPTH, scriptCfc = false } = {}) {
  for (const [name, value] of Object.entries({ maxNodes, maxExpressionBytes, maxDepth })) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  }
  const nodes = [];
  const diagnostics = [];
  const reported = new Set();
  let complete = true;
  let stopped = false;
  function report(code, offset, finish = offset) {
    complete = false;
    // One located diagnostic per category keeps adversarial unknown bodies bounded.
    if (reported.has(code) || diagnostics.length >= MAX_DIAGNOSTICS) return;
    reported.add(code);
    diagnostics.push({ code, severity: code === "UNSUPPORTED_SYNTAX" ? "warning" : "error", file, message: code === "RESOURCE_LIMIT" ? "CFScript structural parsing exceeded a configured bound." : code === "PARSE_PARTIAL" ? "CFScript contains an unterminated or mismatched structural delimiter." : "CFScript contains syntax or a dynamic expression outside the admitted static subset.", span: sourceMap.spanFromTextOffsets(offset, finish) });
  }
  function append(kind, first, last, fields = {}) {
    if (stopped) return;
    if (nodes.length >= maxNodes) { report("RESOURCE_LIMIT", first, last); stopped = true; return; }
    nodes.push({ kind, ...fields, ...sourceLocation(sourceMap, first, last) });
  }
  const tokens = [];
  const delimiters = [];
  const maxTokens = Math.max(128, Math.min(1_000_000, maxNodes * 32));
  let cursor = start;
  let malformed = false;
  while (cursor < end) {
    const character = text[cursor];
    if (/\s/u.test(character) || character === "\uFEFF") { cursor += 1; continue; }
    if (text.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < end && text[cursor] !== "\n" && text[cursor] !== "\r") cursor += 1;
      continue;
    }
    if (text.startsWith("<!---", cursor)) {
      const comment = scanCfmlComment(text, cursor, end, maxDepth);
      if (comment.code) { report(comment.code, cursor, end); malformed = true; break; }
      cursor = comment.next;
      continue;
    }
    const comment = text.startsWith("/*", cursor) ? [2, "*/"] : text.startsWith("<!--", cursor) ? [4, "-->"] : null;
    if (comment) {
      const close = text.indexOf(comment[1], cursor + comment[0]);
      if (close === -1 || close + comment[1].length > end) { report("PARSE_PARTIAL", cursor, end); malformed = true; break; }
      cursor = close + comment[1].length;
      continue;
    }
    if (tokens.length >= maxTokens) { report("RESOURCE_LIMIT", cursor, end); malformed = true; break; }
    const first = cursor;
    let token;
    if (character === "'" || character === '"') {
      token = stringToken(text, cursor, end, maxExpressionBytes);
      if (!token) { report("PARSE_PARTIAL", cursor, end); malformed = true; break; }
      if (Buffer.byteLength(text.slice(token.start, token.end), "utf8") > maxExpressionBytes) {
        token.value = null;
        token.dynamic = true;
        report("RESOURCE_LIMIT", token.start, token.end);
      }
      cursor = token.end;
    } else if (wordStart(character)) {
      cursor += 1;
      while (cursor < end && wordPart(text[cursor])) cursor += 1;
      token = { type: "word", value: text.slice(first, cursor), start: first, end: cursor };
    } else if (/[0-9]/u.test(character)) {
      cursor += 1;
      while (cursor < end && /[0-9.]/u.test(text[cursor])) cursor += 1;
      token = { type: "number", value: text.slice(first, cursor), start: first, end: cursor };
    } else {
      cursor += 1;
      token = { type: "symbol", value: character, start: first, end: cursor };
    }
    if ((token.type === "word" || token.type === "number") && Buffer.byteLength(token.value, "utf8") > maxExpressionBytes) { report("RESOURCE_LIMIT", first, cursor); malformed = true; break; }
    if (["(", "[", "{"].includes(token.value) && token.type === "symbol") {
      if (delimiters.length >= maxDepth) { report("RESOURCE_LIMIT", first, end); malformed = true; break; }
      delimiters.push(tokens.length);
    } else if ([")", "]", "}"].includes(token.value) && token.type === "symbol") {
      const open = delimiters.pop();
      const expected = { ")": "(", "]": "[", "}": "{" }[token.value];
      if (open === undefined || tokens[open].value !== expected) { report("PARSE_PARTIAL", first, cursor); malformed = true; break; }
      token.pair = open;
      tokens[open].pair = tokens.length;
    }
    tokens.push(token);
  }
  if (delimiters.length > 0) { report("PARSE_PARTIAL", tokens[delimiters[0]].start, end); malformed = true; }
  if (malformed) {
    append("OPAQUE_REGION", start, end, { name: "cfscript", parsed: false });
    return { nodes, diagnostics, complete: false };
  }
  const value = (index) => tokens[index]?.type === "word" ? tokens[index].value.toLowerCase() : "";
  const symbol = (index, expected) => tokens[index]?.type === "symbol" && tokens[index].value === expected;
  function qualified(index, finish) {
    if (tokens[index]?.type !== "word") return null;
    const segments = [tokens[index].value];
    let next = index + 1;
    while (next + 1 < finish && symbol(next, ".") && tokens[next + 1].type === "word") { segments.push(tokens[next + 1].value); next += 2; }
    return { segments, value: segments.join("."), next };
  }
  function scalar(first, finish) {
    if (finish !== first + 1) return null;
    const token = tokens[first];
    if (token?.type === "string") return token.dynamic ? null : token.value;
    if (token?.type === "number" && /^\d+(?:\.\d+)?$/u.test(token.value)) return token.value;
    if (token?.type === "word" && ["true", "false", "null"].includes(value(first))) return value(first);
    return null;
  }
  function stringLiteral(first, finish) {
    return finish === first + 1 && tokens[first]?.type === "string" && tokens[first].dynamic !== true ? tokens[first].value : null;
  }
  function argumentsAt(first, finish) {
    const positional = [];
    const named = new Map();
    let admitted = true;
    let item = first;
    for (let index = first; index <= finish; index += 1) {
      if (index < finish && tokens[index].pair > index) { index = tokens[index].pair; continue; }
      if (index !== finish && !symbol(index, ",")) continue;
      if (item === index) { if (first !== finish) admitted = false; item = index + 1; continue; }
      const isNamed = tokens[item].type === "word" && (symbol(item + 1, "=") || symbol(item + 1, ":"));
      const argumentStart = isNamed ? item + 2 : item;
      const target = stringLiteral(argumentStart, index);
      if (isNamed) {
        const key = value(item);
        if (named.has(key)) { admitted = false; named.set(key, null); }
        else named.set(key, target);
      } else positional.push(target);
      if (scalar(argumentStart, index) === null) admitted = false;
      item = index + 1;
    }
    return { positional, named, admitted };
  }
  let boundNames = new Set();
  let declaredFunctions = new Set();
  function collectBindings(first, finish) {
    for (let index = first; index < finish; index += 1) {
      if (value(index) === "function" && tokens[index + 1]?.type === "word" && symbol(index + 2, "(")) declaredFunctions.add(value(index + 1));
      if (tokens[index].type === "word" && symbol(index + 1, "=") && (index === first || value(index - 1) === "var" || symbol(index - 1, ";") || symbol(index - 1, "}"))) boundNames.add(value(index));
      if (tokens[index].pair > index) index = tokens[index].pair;
    }
  }
  function expression(first, finish) {
    let admitted = true;
    let generated = false;
    const covered = new Set();
    const callHeaders = new Set();
    for (let index = first; index < finish && !stopped; index += 1) {
      if (callHeaders.has(index) || tokens[index].type !== "word" || symbol(index - 1, ".")) continue;
      const identifier = qualified(index, finish);
      let open = identifier.next;
      const keyword = identifier.segments.length === 1 ? value(index) : "";
      let component = null;
      if (keyword === "new") {
        const target = qualified(open, finish);
        if (target) {
          open = target.next;
          if (!DYNAMIC_SCOPES.has(target.segments[0].toLowerCase()) && !boundNames.has(target.segments[0].toLowerCase())) component = target.value;
        } else if (tokens[open]?.type === "string") open += 1;
      }
      if (!symbol(open, "(") || tokens[open].pair >= finish) continue;
      const close = tokens[open].pair;
      for (let header = index; header <= open; header += 1) callHeaders.add(header);
      const args = argumentsAt(open + 1, close);
      const expressionStart = tokens[index].start;
      const expressionEnd = tokens[close].end;
      const truncated = Buffer.byteLength(text.slice(expressionStart, expressionEnd), "utf8") > maxExpressionBytes;
      if (truncated) { report("RESOURCE_LIMIT", expressionStart, expressionEnd); admitted = false; }
      const fields = { expression: truncated ? "cfscript bounded expression" : text.slice(expressionStart, expressionEnd), expression_truncated: truncated, dynamic: false };
      let kind = null;
      if (keyword !== "new" && (boundNames.has(keyword) || declaredFunctions.has(keyword))) {
        kind = "CFML_SCRIPT_INVOKE";
        fields.component = null;
        fields.method = identifier.value;
      } else if (keyword === "new") {
        kind = "CFML_SCRIPT_INSTANTIATE";
        fields.component = component;
      } else if (keyword === "createobject") {
        const type = args.named.has("type") ? args.named.get("type") : args.positional[0];
        if (typeof type === "string" && type.toLowerCase() !== "component") { admitted = false; continue; }
        kind = "CFML_SCRIPT_INSTANTIATE";
        fields.creation_kind = "createObject";
        fields.component = type?.toLowerCase() === "component" ? (args.named.has("class") ? args.named.get("class") : args.positional[1]) : null;
      } else if (keyword === "cfobject") {
        kind = "CFML_SCRIPT_INSTANTIATE";
        fields.creation_kind = "cfobject";
        fields.component = args.named.get("component");
      } else if (keyword === "cfinclude") {
        kind = "CFML_SCRIPT_INCLUDE";
        fields.target = args.named.get("template");
      } else if (keyword === "cfmodule") {
        kind = "CFML_SCRIPT_CUSTOM_TAG";
        fields.target_kind = args.named.has("name") ? "name" : "template";
        fields.target = args.named.has("name") ? args.named.get("name") : args.named.get("template");
      } else if (keyword === "location") {
        kind = "CFML_SCRIPT_REDIRECT";
        fields.url = args.named.has("url") ? args.named.get("url") : args.positional[0];
      } else if (keyword === "invoke" || keyword === "cfinvoke") {
        kind = "CFML_SCRIPT_INVOKE";
        fields.invoke_kind = keyword;
        fields.component = args.named.has("component") ? args.named.get("component") : args.positional[0];
        fields.method = args.named.has("method") ? args.named.get("method") : args.positional[1];
      } else if (identifier.segments.length >= 2) {
        kind = "CFML_SCRIPT_INVOKE";
        fields.component = identifier.segments.length >= 3 && !DYNAMIC_SCOPES.has(identifier.segments[0].toLowerCase()) && !boundNames.has(identifier.segments[0].toLowerCase()) ? identifier.segments.slice(0, -1).join(".") : null;
        fields.method = identifier.segments.at(-1);
      } else {
        admitted = false;
        if (keyword === "evaluate") generated = true;
      }
      if (kind) {
        const keys = kind === "CFML_SCRIPT_INVOKE" ? ["component", "method"] : kind === "CFML_SCRIPT_INSTANTIATE" ? ["component"] : kind === "CFML_SCRIPT_REDIRECT" ? ["url"] : ["target"];
        fields.dynamic = truncated || keys.some((key) => typeof fields[key] !== "string" || fields[key] === "");
        if (truncated) for (const key of keys) fields[key] = null;
        append(kind, expressionStart, expressionEnd, fields);
        if (fields.dynamic || !args.admitted) admitted = false;
        for (let used = index; used <= close; used += 1) covered.add(used);
      }
      // Continue through arguments to retain independently visible nested literal links.
    }
    for (let index = first; index < finish; index += 1) {
      if (covered.has(index)) continue;
      if (scalar(index, index + 1) !== null) continue;
      admitted = false;
    }
    if (first !== finish && scalar(first, finish) === null) {
      let root = qualified(first, finish);
      if (value(first) === "new" && root) root = qualified(root.next, finish);
      if (!root || !symbol(root.next, "(") || tokens[root.next].pair !== finish - 1 || !covered.has(first)) admitted = false;
    }
    return { admitted, generated };
  }
  function opaque(first, finish, generated = false) {
    report("UNSUPPORTED_SYNTAX", tokens[first].start, tokens[finish - 1].end);
    append("OPAQUE_REGION", tokens[first].start, tokens[finish - 1].end, { name: "cfscript", parsed: false, ...(generated ? { dynamic_constructs: ["evaluate"] } : {}) });
  }
  function attributesAt(first, finish) {
    const attributes = {};
    const strings = {};
    let admitted = true;
    while (first < finish) {
      if (tokens[first].type !== "word" || !symbol(first + 1, "=")) { admitted = false; break; }
      const name = value(first);
      let next = first + 3;
      while (next < finish && !(tokens[next].type === "word" && symbol(next + 1, "="))) next += 1;
      const literal = scalar(first + 2, next);
      const duplicate = Object.hasOwn(attributes, name);
      if (literal === null || duplicate) admitted = false;
      attributes[name] = duplicate ? null : literal;
      strings[name] = duplicate ? null : stringLiteral(first + 2, next);
      first = next;
    }
    return { attributes, strings, admitted };
  }
  function parseRange(first, finish, context = "script") {
    collectBindings(first, finish);
    while (first < finish && !stopped) {
      if (symbol(first, ";")) { first += 1; continue; }
      const begin = first;
      if (scriptCfc && context === "script" && (begin !== 0 || !["component", "interface"].includes(value(first)))) report("UNSUPPORTED_SYNTAX", tokens[first].start, tokens[first].end);
      if (["component", "interface"].includes(value(first)) && context === "script") {
        let open = first + 1;
        while (open < finish && !symbol(open, "{") && !symbol(open, ";")) open += 1;
        if (!symbol(open, "{")) { opaque(begin, finish); return; }
        const close = tokens[open].pair;
        const metadata = attributesAt(first + 1, open);
        if (Buffer.byteLength(text.slice(tokens[first].start, tokens[open].end), "utf8") > maxExpressionBytes) report("RESOURCE_LIMIT", tokens[first].start, tokens[open].end);
        const parts = file.replace(/\\/gu, "/").replace(/\.cfc$/iu, "").split("/");
        const identity = scriptCfc && parts.every((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(part)) ? parts.join(".") : null;
        append("CFML_SCRIPT_COMPONENT", tokens[first].start, tokens[open].end, { name: identity, declaration_kind: value(first), attributes: metadata.strings, closing: false });
        if (!metadata.admitted || identity === null) report("UNSUPPORTED_SYNTAX", tokens[first].start, tokens[open].end);
        parseRange(open + 1, close, value(first));
        append("CFML_SCRIPT_COMPONENT", tokens[close].start, tokens[close].end, { closing: true });
        first = close + 1;
        continue;
      }
      let functionIndex = first;
      while (functionIndex < finish && functionIndex < first + 8 && tokens[functionIndex].type === "word" && value(functionIndex) !== "function") functionIndex += 1;
      if (value(functionIndex) === "function" && ["script", "component", "interface"].includes(context) && tokens[functionIndex + 1]?.type === "word" && symbol(functionIndex + 2, "(")) {
        const parametersEnd = tokens[functionIndex + 2].pair;
        let open = parametersEnd + 1;
        while (open < finish && !symbol(open, "{") && !symbol(open, ";")) open += 1;
        if (open >= finish) { opaque(begin, finish); return; }
        const name = tokens[functionIndex + 1].value;
        const metadata = attributesAt(parametersEnd + 1, open);
        const prefix = tokens.slice(first, functionIndex).map((token) => token.value.toLowerCase());
        const access = prefix.find((item) => ["public", "private", "package", "remote"].includes(item)) ?? null;
        const nonModifiers = prefix.filter((item) => !MODIFIERS.has(item));
        const enclosingBindings = boundNames;
        const enclosingFunctions = declaredFunctions;
        boundNames = new Set(enclosingBindings);
        declaredFunctions = new Set(enclosingFunctions);
        let parametersAdmitted = true;
        let parameterStart = functionIndex + 3;
        for (let index = parameterStart; index <= parametersEnd; index += 1) {
          if (tokens[index]?.pair > index && index < parametersEnd) { index = tokens[index].pair; continue; }
          if (index !== parametersEnd && !symbol(index, ",")) continue;
          if (parameterStart < index) {
            let equals = parameterStart;
            while (equals < index && !symbol(equals, "=")) equals += 1;
            const words = tokens.slice(parameterStart, equals);
            if (words.length < 1 || words.length > 3 || words.some((token) => token.type !== "word") || (words.length === 3 && words[0].value.toLowerCase() !== "required") || (equals < index && scalar(equals + 1, index) === null)) parametersAdmitted = false;
            if (words.at(-1)?.type === "word") boundNames.add(words.at(-1).value.toLowerCase());
          } else if (parameterStart !== parametersEnd) parametersAdmitted = false;
          parameterStart = index + 1;
        }
        const headerBounded = Buffer.byteLength(text.slice(tokens[first].start, tokens[open].end), "utf8") <= maxExpressionBytes;
        if (!headerBounded) report("RESOURCE_LIMIT", tokens[first].start, tokens[open].end);
        const declarationAdmitted = headerBounded && metadata.admitted && parametersAdmitted && nonModifiers.length <= 1 && prefix.filter((item) => ["public", "private", "package", "remote"].includes(item)).length <= 1 && (symbol(open, ";") ? context === "interface" : context !== "interface");
        if (declarationAdmitted) append("CFML_SCRIPT_METHOD", tokens[first].start, tokens[open].end, { name, access, closing: false });
        else opaque(first, open + 1);
        if (symbol(open, "{")) {
          const close = tokens[open].pair;
          parseRange(open + 1, close, declarationAdmitted ? "method" : "unknown");
          if (declarationAdmitted) append("CFML_SCRIPT_METHOD", tokens[close].start, tokens[close].end, { closing: true });
          first = close + 1;
        } else {
          if (declarationAdmitted) append("CFML_SCRIPT_METHOD", tokens[open].start, tokens[open].end, { closing: true });
          first = open + 1;
        }
        boundNames = enclosingBindings;
        declaredFunctions = enclosingFunctions;
        continue;
      }
      let boundary = first;
      while (boundary < finish && !symbol(boundary, ";") && !symbol(boundary, "{")) {
        if (tokens[boundary].pair > boundary) boundary = tokens[boundary].pair;
        boundary += 1;
      }
      if (symbol(boundary, "{")) {
        // Unknown control blocks remain incomplete, but their lexical link evidence is safe.
        const close = tokens[boundary].pair;
        const result = expression(first, boundary);
        opaque(begin, boundary + 1, result.generated);
        parseRange(boundary + 1, close, "unknown");
        first = close + 1;
        continue;
      }
      const terminated = symbol(boundary, ";");
      if (!terminated) {
        report("PARSE_PARTIAL", tokens[begin].start, tokens[boundary - 1]?.end ?? tokens[begin].end);
        opaque(begin, boundary);
        first = finish;
        continue;
      }
      let expressionStart = first;
      let admitted = true;
      let generated = false;
      if (value(first) === "include") {
        const target = stringLiteral(first + 1, boundary);
        const truncated = Buffer.byteLength(text.slice(tokens[first].start, tokens[boundary - 1]?.end ?? tokens[first].end), "utf8") > maxExpressionBytes;
        append("CFML_SCRIPT_INCLUDE", tokens[first].start, tokens[boundary - 1]?.end ?? tokens[first].end, { target: truncated ? null : target, dynamic: target === null || truncated, expression: "cfscript include", expression_truncated: truncated });
        admitted = target !== null && !truncated;
        if (truncated) report("RESOURCE_LIMIT", tokens[first].start, tokens[boundary - 1].end);
      } else if (["cfinclude", "cfmodule", "cfobject", "cfinvoke"].includes(value(first)) && !symbol(first + 1, "(")) {
        const metadata = attributesAt(first + 1, boundary);
        const attributes = metadata.strings;
        const keyword = value(first);
        const kind = keyword === "cfinclude" ? "CFML_SCRIPT_INCLUDE" : keyword === "cfmodule" ? "CFML_SCRIPT_CUSTOM_TAG" : keyword === "cfobject" ? "CFML_SCRIPT_INSTANTIATE" : "CFML_SCRIPT_INVOKE";
        const fields = keyword === "cfinclude" ? { target: attributes.template } : keyword === "cfmodule" ? { target: Object.hasOwn(attributes, "name") ? attributes.name : attributes.template, target_kind: Object.hasOwn(attributes, "name") ? "name" : "template" } : keyword === "cfobject" ? { component: attributes.component, creation_kind: "cfobject" } : { component: attributes.component, method: attributes.method, invoke_kind: "cfinvoke" };
        const truncated = Buffer.byteLength(text.slice(tokens[first].start, tokens[boundary - 1]?.end ?? tokens[first].end), "utf8") > maxExpressionBytes;
        const dynamic = truncated || (keyword === "cfinvoke" ? !fields.component || !fields.method : !(fields.target ?? fields.component));
        if (truncated) { for (const key of ["target", "component", "method"]) if (Object.hasOwn(fields, key)) fields[key] = null; report("RESOURCE_LIMIT", tokens[first].start, tokens[boundary - 1].end); }
        append(kind, tokens[first].start, tokens[boundary - 1]?.end ?? tokens[first].end, { ...fields, dynamic, expression: `cfscript ${keyword}`, expression_truncated: truncated });
        admitted = metadata.admitted && !dynamic;
      } else {
        if (value(expressionStart) === "return") expressionStart += 1;
        else {
          if (value(expressionStart) === "var") expressionStart += 1;
          const assigned = qualified(expressionStart, boundary);
          if (assigned && symbol(assigned.next, "=")) {
            boundNames.add(assigned.segments[0].toLowerCase());
            expressionStart = assigned.next + 1;
          } else if (expressionStart !== first) admitted = false;
        }
        const result = expression(expressionStart, boundary);
        admitted = admitted && result.admitted;
        generated = result.generated;
        if (expressionStart === boundary && value(first) !== "return") admitted = false;
      }
      if (!admitted) opaque(begin, boundary + 1, generated);
      first = boundary + 1;
    }
  }
  parseRange(0, tokens.length);
  return { nodes, diagnostics, complete };
}
