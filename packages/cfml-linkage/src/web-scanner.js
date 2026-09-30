import path from "node:path";

import { createCfmlScannerBackend } from "./cfml-scanner.js";

const DEFAULT_MAX_NODES = 10_000;
const DEFAULT_MAX_ATTRIBUTE_BYTES = 4_096;
const DEFAULT_MAX_EXPRESSION_BYTES = 4_096;
const HTML_EXTENSIONS = new Set([".cfm", ".cfml", ".cfc", ".html", ".htm"]);
const CFML_EXTENSIONS = new Set([".cfm", ".cfml", ".cfc"]);
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs"]);
const CSS_EXTENSIONS = new Set([".css"]);
const SQL_EXTENSIONS = new Set([".sql"]);
const CFML_DYNAMIC_SCOPE_NAMES = new Set(["application", "arguments", "attributes", "caller", "cgi", "client", "cookie", "form", "local", "request", "server", "session", "this", "url", "variables"]);

function startsWithInsensitiveAt(text, value, offset) {
  if (offset + value.length > text.length) return false;
  return text.slice(offset, offset + value.length).toLowerCase() === value.toLowerCase();
}

function isWhitespace(character) {
  if (character === undefined) return false;
  return /\s/u.test(character);
}

function isNameCharacter(character) {
  if (character === undefined) return false;
  return /[A-Za-z0-9_:\-.]/u.test(character);
}

function boundedValue(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return { value, truncated: false };
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end -= 1;
  return { value: value.slice(0, end), truncated: true };
}

function diagnostic(code, severity, message, file, sourceMap, start, end = start) {
  let span;
  try {
    span = sourceMap.spanFromTextOffsets(start, end);
  } catch {
    span = undefined;
  }
  return { code, severity, file, message, ...(span ? { span } : {}) };
}

function nodeSpan(sourceMap, start, end) {
  return {
    span: sourceMap.spanFromTextOffsets(start, end),
    byte_start: sourceMap.textOffsetToByteOffset(start),
    byte_end: sourceMap.textOffsetToByteOffset(end),
  };
}

function parseTag(text, start, sourceMap, file, maxAttributeBytes) {
  let cursor = start + 1;
  if (text[cursor] === "/" || text[cursor] === "!" || text[cursor] === "?") return null;
  const nameStart = cursor;
  while (isNameCharacter(text[cursor])) cursor += 1;
  if (cursor === nameStart) return null;
  const name = text.slice(nameStart, cursor).toLowerCase();
  let quote = null;
  let end = cursor;
  while (end < text.length) {
    const character = text[end];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      break;
    }
    end += 1;
  }
  if (end >= text.length || quote !== null) {
    return {
      error: diagnostic("PARSE_PARTIAL", "error", "HTML tag is missing a complete closing delimiter.", file, sourceMap, start, text.length),
      next: text.length,
    };
  }

  const attributes = [];
  while (cursor < end) {
    while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
    if (cursor >= end || text[cursor] === "/") break;
    const attributeStart = cursor;
    while (cursor < end && isNameCharacter(text[cursor])) cursor += 1;
    if (cursor === attributeStart) {
      cursor += 1;
      continue;
    }
    const attributeName = text.slice(attributeStart, cursor).toLowerCase();
    while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
    let value = null;
    let valueQuote = null;
    let valueStart = cursor;
    let valueEnd = cursor;
    let truncated = false;
    if (text[cursor] === "=") {
      cursor += 1;
      while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
      valueStart = cursor;
      if (text[cursor] === "\"" || text[cursor] === "'") {
        valueQuote = text[cursor];
        cursor += 1;
        valueStart = cursor;
        while (cursor < end && text[cursor] !== valueQuote) cursor += 1;
        valueEnd = cursor;
        if (cursor < end) cursor += 1;
      } else {
        while (cursor < end && !isWhitespace(text[cursor]) && text[cursor] !== ">") cursor += 1;
        valueEnd = cursor;
      }
      const bounded = boundedValue(text.slice(valueStart, valueEnd), maxAttributeBytes);
      value = bounded.value;
      truncated = bounded.truncated;
    }
    attributes.push({
      name: attributeName,
      value,
      quote: valueQuote,
      ...(truncated ? { truncated: true } : {}),
      span: sourceMap.spanFromTextOffsets(attributeStart, cursor),
    });
  }

  return {
    node: {
      kind: "HTML_TAG",
      name,
      closing: false,
      self_closing: text[end - 1] === "/",
      attributes,
      ...nodeSpan(sourceMap, start, end + 1),
    },
    next: end + 1,
  };
}

function findClosingTag(text, name, start) {
  const needle = `</${name}`;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    if (!startsWithInsensitiveAt(text, needle, cursor)) continue;
    const afterName = text[cursor + needle.length];
    if (afterName === ">" || isWhitespace(afterName)) return cursor;
  }
  return -1;
}

function attribute(node, name) {
  return node.attributes.find((item) => item.name === name) ?? null;
}

function staticAttribute(node, name) {
  const item = attribute(node, name);
  if (!item || item.truncated === true || typeof item.value !== "string" || item.value.trim() === "" || item.value.includes("#")) return null;
  return item.value.trim();
}

function hasDynamicAttribute(node, names) {
  return names.some((name) => {
    const item = attribute(node, name);
    return item && (item.truncated === true || item.value === null || (typeof item.value === "string" && item.value.includes("#")));
  });
}

function isIdentifierStart(character) {
  return character !== undefined && /[A-Za-z_$]/u.test(character);
}

function isIdentifierCharacter(character) {
  return character !== undefined && /[A-Za-z0-9_$]/u.test(character);
}

function skipWhitespace(text, offset, end) {
  let cursor = offset;
  while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
  return cursor;
}

function parseQuoted(text, start, end) {
  const quote = text[start];
  if (quote !== "\"" && quote !== "'") return null;
  let cursor = start + 1;
  let value = "";
  while (cursor < end) {
    const character = text[cursor];
    if (character === quote) return { value, end: cursor + 1 };
    if (character === "\\" && cursor + 1 < end) {
      value += text[cursor + 1];
      cursor += 2;
      continue;
    }
    value += character;
    cursor += 1;
  }
  return null;
}

function skipJavaScriptString(text, start, end) {
  const parsed = parseQuoted(text, start, end);
  if (parsed) return parsed.end;
  if (text[start] !== "`") return start + 1;
  let cursor = start + 1;
  while (cursor < end) {
    if (text[cursor] === "\\") {
      cursor += 2;
    } else if (text[cursor] === "`") {
      return cursor + 1;
    } else {
      cursor += 1;
    }
  }
  return end;
}

function skipJavaScriptTrivia(text, start, end) {
  let cursor = start;
  while (cursor < end) {
    cursor = skipWhitespace(text, cursor, end);
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function findCallEnd(text, open, end) {
  let depth = 0;
  let cursor = open;
  while (cursor < end) {
    const character = text[cursor];
    if (character === "\"" || character === "'" || character === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return end;
}

function argumentFrom(text, start, end) {
  let cursor = skipJavaScriptTrivia(text, start, end);
  const first = parseQuoted(text, cursor, end);
  if (first) return { value: first.value, dynamic: false };
  const argumentStart = cursor;
  let depth = 0;
  while (cursor < end) {
    const character = text[cursor];
    if (character === "\"" || character === "'" || character === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (character === "(" || character === "[" || character === "{") depth += 1;
    if (character === ")" || character === "]" || character === "}") {
      if (depth === 0) break;
      depth -= 1;
    }
    if (character === "," && depth === 0) break;
    cursor += 1;
  }
  return { value: text.slice(argumentStart, cursor).trim(), dynamic: true };
}

function firstArgument(text, open, end) {
  return argumentFrom(text, open + 1, end);
}

function propertyString(text, start, end, propertyName) {
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    if (startsWithInsensitiveAt(text, propertyName, cursor)) {
      const before = text[cursor - 1];
      const after = text[cursor + propertyName.length];
      if (!isIdentifierCharacter(before) && !isIdentifierCharacter(after)) {
        let valueStart = skipJavaScriptTrivia(text, cursor + propertyName.length, end);
        if (text[valueStart] === ":") {
          valueStart = skipJavaScriptTrivia(text, valueStart + 1, end);
          const parsed = parseQuoted(text, valueStart, end);
          if (parsed) return { value: parsed.value, dynamic: false };
          return { value: text.slice(valueStart, Math.min(end, valueStart + 256)).trim(), dynamic: true };
        }
      }
    }
    cursor += 1;
  }
  return null;
}

function javascriptNodes(text, start, end, sourceMap, file, maxExpressionBytes) {
  const nodes = [];
  let cursor = start;
  while (cursor < end) {
    const character = text[cursor];
    if (character === "\"" || character === "'" || character === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    if (!isIdentifierStart(character)) {
      cursor += 1;
      continue;
    }

    const identifierStart = cursor;
    cursor += 1;
    while (cursor < end && isIdentifierCharacter(text[cursor])) cursor += 1;
    const identifier = text.slice(identifierStart, cursor);
    const before = text.slice(0, identifierStart).trimEnd().slice(-1);
    const open = skipJavaScriptTrivia(text, cursor, end);
    let kind = null;
    let target = null;
    let method = null;
    let wrapper = null;
    if (identifier === "fetch" && text[open] === "(") {
      kind = "JS_FETCH";
      target = firstArgument(text, open, end);
    } else if (identifier === "ajax" && before === "." && text[open] === "(") {
      kind = "JS_AJAX";
      wrapper = "jquery-ajax";
      const callEnd = findCallEnd(text, open, end);
      target = propertyString(text, open + 1, callEnd, "url") ?? firstArgument(text, open, end);
      method = propertyString(text, open + 1, callEnd, "method") ?? propertyString(text, open + 1, callEnd, "type");
    } else if (identifier === "open" && before === "." && text[open] === "(") {
      kind = "JS_AJAX";
      wrapper = "xhr-open";
      const first = firstArgument(text, open, end);
      const comma = text.indexOf(",", open + 1);
      const second = comma === -1 ? null : argumentFrom(text, comma + 1, end);
      target = second ?? { value: "", dynamic: true };
      method = first;
    }
    if (kind === null) continue;

    const callEnd = findCallEnd(text, open, end);
    const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
    nodes.push({
      kind,
      expression: bounded.value,
      expression_truncated: bounded.truncated,
      target: target ?? { value: "", dynamic: true },
      ...(method ? { method } : {}),
      ...(wrapper ? { wrapper } : {}),
      ...nodeSpan(sourceMap, identifierStart, callEnd),
    });
    cursor = callEnd;
  }
  return nodes;
}

function qualifiedIdentifierAt(text, start, end) {
  let cursor = skipJavaScriptTrivia(text, start, end);
  const segments = [];
  while (cursor < end && isIdentifierStart(text[cursor])) {
    const segmentStart = cursor;
    cursor += 1;
    while (cursor < end && isIdentifierCharacter(text[cursor])) cursor += 1;
    segments.push(text.slice(segmentStart, cursor));
    const dot = skipJavaScriptTrivia(text, cursor, end);
    if (text[dot] !== ".") {
      cursor = dot;
      break;
    }
    cursor = skipJavaScriptTrivia(text, dot + 1, end);
  }
  return segments.length > 0 ? { segments, value: segments.join("."), end: cursor } : null;
}

function isStaticCfmlComponent(segments) {
  return segments.length >= 2 && !CFML_DYNAMIC_SCOPE_NAMES.has(segments[0].toLowerCase());
}

function namedStringArgument(text, start, end, name) {
  let cursor = start;
  while (cursor < end) {
    cursor = skipJavaScriptTrivia(text, cursor, end);
    if (cursor >= end) break;
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (!isIdentifierStart(text[cursor])) {
      cursor += 1;
      continue;
    }
    const argumentStart = cursor;
    cursor += 1;
    while (cursor < end && isIdentifierCharacter(text[cursor])) cursor += 1;
    if (text.slice(argumentStart, cursor).toLowerCase() !== name.toLowerCase()) continue;
    const separator = skipJavaScriptTrivia(text, cursor, end);
    if (text[separator] !== "=" && text[separator] !== ":") continue;
    const valueStart = skipJavaScriptTrivia(text, separator + 1, end);
    const value = parseQuoted(text, valueStart, end);
    return { found: true, value: value?.value ?? null, start: valueStart, end: value?.end ?? valueStart };
  }
  return { found: false, value: null };
}

function firstNamedStringArgument(text, start, end, names) {
  for (const name of names) {
    const argument = namedStringArgument(text, start, end, name);
    if (argument.found) return argument;
  }
  return { found: false, value: null };
}

function staticInvokeArguments(text, open, end) {
  const first = parseQuoted(text, skipJavaScriptTrivia(text, open + 1, end), end);
  if (first) {
    const comma = skipJavaScriptTrivia(text, first.end, end);
    if (text[comma] === ",") {
      const second = parseQuoted(text, skipJavaScriptTrivia(text, comma + 1, end), end);
      if (second) return { component: first.value, method: second.value };
    }
  }
  const component = namedStringArgument(text, open + 1, end, "component");
  const method = namedStringArgument(text, open + 1, end, "method");
  if (component.found || method.found) return { component: component.value, method: method.value };
  return null;
}

function locationArguments(text, open, end) {
  const first = parseQuoted(text, skipJavaScriptTrivia(text, open + 1, end), end);
  if (first) return { url: first.value };
  const named = namedStringArgument(text, open + 1, end, "url");
  return { url: named.found ? named.value : null };
}

function createObjectArguments(text, open, end) {
  const firstStart = skipJavaScriptTrivia(text, open + 1, end);
  const first = parseQuoted(text, firstStart, end);
  if (first) {
    if (first.value.trim().toLowerCase() !== "component") return null;
    const comma = skipJavaScriptTrivia(text, first.end, end);
    if (text[comma] !== ",") return { component: null };
    const secondStart = skipJavaScriptTrivia(text, comma + 1, end);
    const second = parseQuoted(text, secondStart, end);
    return { component: second?.value ?? null };
  }
  const type = namedStringArgument(text, open + 1, end, "type");
  const component = namedStringArgument(text, open + 1, end, "class");
  if (type.found && type.value !== null && type.value.trim().toLowerCase() !== "component") return null;
  if (type.found || component.found) return { component: component.value };
  return { component: null };
}

function cfscriptNodes(text, start, end, sourceMap, file, maxExpressionBytes) {
  const nodes = [];
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const close = text.indexOf("*/", cursor + 2);
      cursor = close === -1 ? end : close + 2;
      continue;
    }
    if (!isIdentifierStart(text[cursor])) {
      cursor += 1;
      continue;
    }

    const identifierStart = cursor;
    const identifier = qualifiedIdentifierAt(text, cursor, end);
    if (!identifier) {
      cursor += 1;
      continue;
    }
    cursor = identifier.end;
    const keyword = identifier.segments.length === 1 ? identifier.segments[0].toLowerCase() : "";
    if (keyword === "include") {
      const target = parseQuoted(text, skipJavaScriptTrivia(text, cursor, end), end);
      if (target) {
        const bounded = boundedValue(text.slice(identifierStart, target.end), maxExpressionBytes);
        nodes.push({ kind: "CFML_SCRIPT_INCLUDE", target: target.value, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, target.end) });
        cursor = target.end;
      }
      continue;
    }
    if (keyword === "location") {
      const open = skipJavaScriptTrivia(text, cursor, end);
      if (text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        if (callEnd > open && text[callEnd - 1] === ")") {
          const args = locationArguments(text, open, callEnd - 1);
          const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
          nodes.push({ kind: "CFML_SCRIPT_REDIRECT", url: args.url, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
          cursor = callEnd;
        }
      }
      continue;
    }
    if (["cfinclude", "cfmodule", "cfobject"].includes(keyword)) {
      const open = skipJavaScriptTrivia(text, cursor, end);
      if (text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        if (callEnd > open && text[callEnd - 1] === ")") {
          const argument = keyword === "cfinclude"
            ? firstNamedStringArgument(text, open + 1, callEnd - 1, ["template"])
            : keyword === "cfmodule"
              ? firstNamedStringArgument(text, open + 1, callEnd - 1, ["name", "template"])
              : firstNamedStringArgument(text, open + 1, callEnd - 1, ["component"]);
          if (argument.found) {
            const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
            nodes.push({ kind: keyword === "cfinclude" ? "CFML_SCRIPT_INCLUDE" : keyword === "cfmodule" ? "CFML_SCRIPT_CUSTOM_TAG" : "CFML_SCRIPT_INSTANTIATE", ...(keyword === "cfmodule" ? { target: argument.value } : keyword === "cfobject" ? { creation_kind: "cfobject", component: argument.value } : { target: argument.value }), expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
            cursor = callEnd;
          }
        }
      }
      continue;
    }
    if (keyword === "new" && identifier.segments.length === 1) {
      const component = qualifiedIdentifierAt(text, cursor, end);
      const open = component ? skipJavaScriptTrivia(text, component.end, end) : -1;
      if (component && isStaticCfmlComponent(component.segments) && text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        if (callEnd > open && text[callEnd - 1] === ")") {
          const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
          nodes.push({ kind: "CFML_SCRIPT_INSTANTIATE", component: component.value, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
          cursor = callEnd;
        }
      }
      continue;
    }
    if (keyword === "invoke" || keyword === "cfinvoke") {
      const open = skipJavaScriptTrivia(text, cursor, end);
      if (text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        const args = callEnd > open && text[callEnd - 1] === ")" ? staticInvokeArguments(text, open, callEnd - 1) : null;
        if (args) {
          const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
          nodes.push({ kind: "CFML_SCRIPT_INVOKE", ...(keyword === "cfinvoke" ? { invoke_kind: "cfinvoke" } : {}), component: args.component, method: args.method, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
          cursor = callEnd;
        }
      }
      continue;
    }
    if (keyword === "createobject") {
      const open = skipJavaScriptTrivia(text, cursor, end);
      if (text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        const args = callEnd > open && text[callEnd - 1] === ")" ? createObjectArguments(text, open, callEnd - 1) : null;
        if (args) {
          const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
          nodes.push({ kind: "CFML_SCRIPT_INSTANTIATE", creation_kind: "createObject", component: args.component, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
          cursor = callEnd;
        }
      }
      continue;
    }
    if (isStaticCfmlComponent(identifier.segments) && identifier.segments.length >= 3) {
      const open = skipJavaScriptTrivia(text, cursor, end);
      if (text[open] === "(") {
        const callEnd = findCallEnd(text, open, end);
        if (callEnd > open && text[callEnd - 1] === ")") {
          const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
          nodes.push({ kind: "CFML_SCRIPT_INVOKE", component: identifier.segments.slice(0, -1).join("."), method: identifier.segments.at(-1), expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, identifierStart, callEnd) });
          cursor = callEnd;
        }
      }
    }
  }
  return nodes;
}

function parseSqlQuoted(text, start, end) {
  const quote = text[start];
  if (quote !== "\"" && quote !== "'" && quote !== "`") return null;
  let cursor = start + 1;
  let value = "";
  while (cursor < end) {
    const character = text[cursor];
    if (character === "\\" && cursor + 1 < end) {
      value += text[cursor + 1];
      cursor += 2;
      continue;
    }
    if (character === quote) {
      if (text[cursor + 1] === quote) {
        value += quote;
        cursor += 2;
        continue;
      }
      return { value, end: cursor + 1 };
    }
    value += character;
    cursor += 1;
  }
  return null;
}

function skipSqlTrivia(text, start, end) {
  let cursor = start;
  while (cursor < end) {
    if (isWhitespace(text[cursor])) {
      cursor += 1;
      continue;
    }
    if (text.startsWith("--", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    break;
  }
  return cursor;
}

function sqlIdentifierPart(text, start, end) {
  if (text[start] === "\"" || text[start] === "`") {
    const parsed = parseSqlQuoted(text, start, end);
    return parsed ? { value: parsed.value, end: parsed.end } : null;
  }
  if (text[start] === "[") {
    const close = text.indexOf("]", start + 1);
    if (close < 0 || close >= end) return null;
    return { value: text.slice(start + 1, close), end: close + 1 };
  }
  const match = /[A-Za-z0-9_$-]/u.test(text[start] ?? "") ? /^[A-Za-z0-9_$-]+/u.exec(text.slice(start, end)) : null;
  return match ? { value: match[0], end: start + match[0].length } : null;
}

function sqlTokens(text, start, end) {
  const tokens = [];
  let cursor = start;
  while (cursor < end) {
    cursor = skipSqlTrivia(text, cursor, end);
    if (cursor >= end) break;
    if (text[cursor] === "'") {
      const parsed = parseSqlQuoted(text, cursor, end);
      cursor = parsed?.end ?? end;
      continue;
    }
    const tokenStart = cursor;
    const first = sqlIdentifierPart(text, cursor, end);
    if (!first) {
      cursor += 1;
      continue;
    }
    let value = first.value;
    cursor = first.end;
    while (cursor < end && text[cursor] === ".") {
      const next = sqlIdentifierPart(text, cursor + 1, end);
      if (!next) break;
      value += `.${next.value}`;
      cursor = next.end;
    }
    tokens.push({ value: value.toLowerCase(), start: tokenStart, end: cursor });
  }
  return tokens;
}

function sqlIdentifierAt(text, start, end) {
  const cursor = skipSqlTrivia(text, start, end);
  const identifier = sqlIdentifierPart(text, cursor, end);
  return identifier ? { value: identifier.value.toLowerCase(), end: identifier.end } : null;
}

function skipSqlParenthesized(text, start, end) {
  if (text[start] !== "(") return start;
  let depth = 0;
  let cursor = start;
  while (cursor < end) {
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      const parsed = parseSqlQuoted(text, cursor, end);
      cursor = parsed?.end ?? end;
      continue;
    }
    if (text.startsWith("--", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    if (text[cursor] === "(") depth += 1;
    if (text[cursor] === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
    cursor += 1;
  }
  return end;
}

function sqlCteNames(text, start, end) {
  const names = new Set();
  let cursor = skipSqlTrivia(text, start, end);
  const withKeyword = sqlIdentifierAt(text, cursor, end);
  if (!withKeyword || withKeyword.value !== "with") return names;
  cursor = withKeyword.end;
  const recursive = sqlIdentifierAt(text, cursor, end);
  if (recursive?.value === "recursive") cursor = recursive.end;
  while (cursor < end) {
    const alias = sqlIdentifierAt(text, cursor, end);
    if (!alias) break;
    cursor = skipSqlTrivia(text, alias.end, end);
    if (text[cursor] === "(") cursor = skipSqlParenthesized(text, cursor, end);
    const asKeyword = sqlIdentifierAt(text, cursor, end);
    if (!asKeyword || asKeyword.value !== "as") break;
    cursor = skipSqlTrivia(text, asKeyword.end, end);
    if (text[cursor] !== "(") break;
    cursor = skipSqlParenthesized(text, cursor, end);
    names.add(alias.value);
    cursor = skipSqlTrivia(text, cursor, end);
    if (text[cursor] !== ",") break;
    cursor += 1;
  }
  return names;
}

function isDynamicSqlIdentifier(text, token) {
  return text[token.start - 1] === "#" || text[token.end] === "#" || token.value.includes("#");
}

function dynamicSqlExpression(text, token, end) {
  const startsAtMarker = text[token.start - 1] === "#";
  const opening = startsAtMarker ? token.start - 1 : text[token.end] === "#" ? token.end : -1;
  const start = startsAtMarker ? token.start - 1 : token.start;
  const close = opening >= 0 ? text.indexOf("#", opening + 1) : -1;
  const finish = close >= 0 && close < end ? close + 1 : Math.min(end, token.end);
  return text.slice(start, finish).trim().slice(0, 256) || `#${token.value}#`;
}

function tableReferenceIndex(tokens, keywordIndex) {
  let candidate = keywordIndex + 1;
  while (["cross", "full", "inner", "lateral", "left", "natural", "only", "outer", "right"].includes(tokens[candidate]?.value)) candidate += 1;
  return candidate;
}

function sqlStatementRanges(text, start, end) {
  const ranges = [];
  let statementStart = start;
  let cursor = start;
  const addRange = (statementEnd) => {
    let trimmedStart = statementStart;
    while (trimmedStart < statementEnd && isWhitespace(text[trimmedStart])) trimmedStart += 1;
    let trimmedEnd = statementEnd;
    while (trimmedEnd > trimmedStart && isWhitespace(text[trimmedEnd - 1])) trimmedEnd -= 1;
    if (trimmedStart < trimmedEnd) ranges.push({ start: trimmedStart, end: trimmedEnd });
  };
  while (cursor < end) {
    if (cursor === start || text[cursor - 1] === "\n") {
      const lineEnd = text.indexOf("\n", cursor);
      const batchEnd = lineEnd === -1 ? end : lineEnd;
      if (/^\s*GO(?:\s+\d+)?\s*(?:--.*)?$/iu.test(text.slice(cursor, batchEnd))) {
        addRange(cursor);
        statementStart = lineEnd === -1 ? end : lineEnd + 1;
        cursor = statementStart;
        continue;
      }
    }
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      const quoted = parseSqlQuoted(text, cursor, end);
      cursor = quoted?.end ?? end;
      continue;
    }
    if (text.startsWith("--", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? end : blockEnd + 2;
      continue;
    }
    if (text[cursor] === ";") {
      addRange(cursor);
      statementStart = cursor + 1;
    }
    cursor += 1;
  }
  addRange(end);
  return ranges.length > 0 ? ranges : [{ start, end }];
}

function sqlTableReferences(text, start, end) {
  const tokens = sqlTokens(text, start, end);
  const cteNames = sqlCteNames(text, start, end);
  const tables = [];
  const dynamicTables = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const keyword = tokens[index].value;
    let tableIndex = -1;
    if (keyword === "from" || keyword === "join" || keyword === "update" || keyword === "into" || keyword === "references") tableIndex = tableReferenceIndex(tokens, index);
    else if (keyword === "delete" && tokens[index + 1]?.value === "from") tableIndex = tableReferenceIndex(tokens, index + 1);
    else if (["alter", "create", "drop", "truncate"].includes(keyword)) {
      let candidate = index + 1;
      if (keyword === "create" && ["or", "replace"].includes(tokens[candidate]?.value)) candidate += 2;
      while (["global", "local", "temporary", "temp"].includes(tokens[candidate]?.value)) candidate += 1;
      if (tokens[candidate]?.value === "table") {
        candidate += 1;
        while (["if", "not", "exists", "only", "temporary", "temp"].includes(tokens[candidate]?.value)) candidate += 1;
        tableIndex = candidate;
      }
    } else if (keyword === "using" && tokens[0]?.value === "merge") tableIndex = tableReferenceIndex(tokens, index);
    else if (keyword === "lock" && tokens[index + 1]?.value === "table") tableIndex = tableReferenceIndex(tokens, index + 1);
    else if (keyword === "comment" && tokens[index + 1]?.value === "on" && tokens[index + 2]?.value === "table") tableIndex = tableReferenceIndex(tokens, index + 2);
    else if (["grant", "revoke"].includes(keyword)) {
      const onIndex = tokens.findIndex((token, tokenIndex) => tokenIndex > index && token.value === "on");
      if (onIndex >= 0 && tokens[onIndex + 1]?.value === "table") tableIndex = tableReferenceIndex(tokens, onIndex + 1);
    } else if (["analyze", "cluster", "copy"].includes(keyword)) tableIndex = tableReferenceIndex(tokens, index);
    else if (keyword === "vacuum") {
      const candidate = tokens[index + 1]?.value === "analyze" ? index + 2 : index + 1;
      tableIndex = tableReferenceIndex(tokens, candidate - 1);
    } else if (keyword === "reindex") {
      tableIndex = tokens[index + 1]?.value === "table" ? tableReferenceIndex(tokens, index + 1) : tableReferenceIndex(tokens, index);
    }
    if (tableIndex < 0 || !tokens[tableIndex]) continue;
    const tableToken = tokens[tableIndex];
    if (tableToken.value === "select" || tableToken.value === "(" || cteNames.has(tableToken.value) || (tokens[0]?.value === "copy" && keyword === "from" && ["stdin", "stdout"].includes(tableToken.value))) continue;
    if (isDynamicSqlIdentifier(text, tableToken)) dynamicTables.push(dynamicSqlExpression(text, tableToken, end));
    else tables.push(tableToken.value);
  }
  return {
    tables: [...new Set(tables)].sort(),
    dynamicTables: [...new Set(dynamicTables)].sort(),
  };
}

function sqlNode(text, start, end, sourceMap, file, attributes = {}, sqlStart = start, sqlEnd = end) {
  const references = sqlTableReferences(text, sqlStart, sqlEnd);
  return {
    kind: "SQL_QUERY",
    tables: references.tables,
    dynamic_tables: references.dynamicTables,
    expression: references.tables.length > 0
      ? `sql tables ${references.tables.join(", ")}`
      : references.dynamicTables.length > 0
        ? `sql dynamic identifiers ${references.dynamicTables.join(", ")}`
        : "visible sql query",
    ...attributes,
    ...nodeSpan(sourceMap, start, end),
  };
}

function queryExecuteDatasource(text, start, end) {
  const match = /\bdatasource\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^,}\n)]{1,256}))/iu.exec(text.slice(start, end));
  if (!match) return { datasource: null, datasource_expression: null, datasource_dynamic: false };
  const expression = (match[1] ?? match[2] ?? match[3] ?? "").trim().slice(0, 256);
  const literal = match[1] ?? match[2] ?? null;
  return {
    datasource: literal !== null && !literal.includes("#") && literal.trim() !== "" ? literal.trim() : null,
    datasource_expression: expression || null,
    datasource_dynamic: literal === null || literal.includes("#") || literal.trim() === "",
  };
}

function queryExecuteNodes(text, start, end, sourceMap, file, maxExpressionBytes, limit) {
  const nodes = [];
  if (limit <= 0) return { nodes, limited: false };
  let cursor = start;
  let limited = false;
  while (cursor < end) {
    if (text.startsWith("<!---", cursor)) {
      const close = text.indexOf("--->", cursor + 5);
      cursor = close === -1 ? end : close + 4;
      continue;
    }
    if (text.startsWith("<!--", cursor)) {
      const close = text.indexOf("-->", cursor + 4);
      cursor = close === -1 ? end : close + 3;
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? end : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const close = text.indexOf("*/", cursor + 2);
      cursor = close === -1 ? end : close + 2;
      continue;
    }
    if (text[cursor] === "\"" || text[cursor] === "'" || text[cursor] === "`") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (!isIdentifierStart(text[cursor])) {
      cursor += 1;
      continue;
    }
    const identifierStart = cursor;
    cursor += 1;
    while (cursor < end && isIdentifierCharacter(text[cursor])) cursor += 1;
    if (text.slice(identifierStart, cursor).toLowerCase() !== "queryexecute") continue;
    const open = skipJavaScriptTrivia(text, cursor, end);
    if (text[open] !== "(") continue;
    const callEnd = findCallEnd(text, open, end);
    if (callEnd <= open || text[callEnd - 1] !== ")") {
      cursor = callEnd;
      continue;
    }
    const sqlStart = skipJavaScriptTrivia(text, open + 1, callEnd - 1);
    const positionalSql = parseQuoted(text, sqlStart, callEnd - 1);
    const namedSql = namedStringArgument(text, sqlStart, callEnd - 1, "sql");
    const sql = positionalSql ?? (namedSql.found ? namedSql : null);
    const staticSql = sql !== null && typeof sql.value === "string";
    if (nodes.length >= limit) {
      limited = true;
      break;
    }
    const bounded = boundedValue(text.slice(identifierStart, callEnd), maxExpressionBytes);
    if (!staticSql) {
      nodes.push(sqlNode(text, identifierStart, callEnd, sourceMap, file, {
        statement_kind: "queryExecute",
        dynamic_sql: true,
        ...queryExecuteDatasource(text, sqlStart, callEnd - 1),
        expression: bounded.value,
        expression_truncated: bounded.truncated,
      }, sqlStart, sqlStart));
    } else {
      const sqlValueStart = sql.start ?? sqlStart;
      nodes.push(sqlNode(text, identifierStart, callEnd, sourceMap, file, {
        statement_kind: "queryExecute",
        ...queryExecuteDatasource(text, sql.end, callEnd - 1),
        expression: bounded.value,
        expression_truncated: bounded.truncated,
      }, sqlValueStart + 1, sql.end - 1));
    }
    cursor = callEnd;
  }
  return { nodes, limited };
}

function addNode(nodes, node, diagnostics, maxNodes, file, sourceMap, offset) {
  if (nodes.length >= maxNodes) {
    diagnostics.push(diagnostic("RESOURCE_LIMIT", "error", `Web parser node limit exceeded: ${maxNodes}.`, file, sourceMap, offset));
    return false;
  }
  nodes.push(node);
  return true;
}

function scanHtml(text, sourceMap, file, maxNodes, maxAttributeBytes, maxExpressionBytes) {
  const nodes = [];
  const diagnostics = [];
  let complete = true;
  let cursor = 0;
  while (cursor < text.length) {
    if (text.startsWith("<!--", cursor)) {
      const end = text.indexOf("-->", cursor + 4);
      if (end === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "HTML comment is not terminated.", file, sourceMap, cursor, text.length));
        complete = false;
        break;
      }
      cursor = end + 3;
      continue;
    }
    if (text[cursor] !== "<") {
      cursor += 1;
      continue;
    }
    const parsed = parseTag(text, cursor, sourceMap, file, maxAttributeBytes);
    if (parsed === null) {
      cursor += 1;
      continue;
    }
    if (parsed.error) {
      diagnostics.push(parsed.error);
      complete = false;
      break;
    }
    const node = parsed.node;
    const action = staticAttribute(node, "action");
    if (CFML_EXTENSIONS.has(extensionFor(file)) && node.name === "cfscript") {
      const closeStart = findClosingTag(text, "cfscript", parsed.next);
      if (closeStart === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "CFScript region is not terminated.", file, sourceMap, parsed.next, text.length));
        complete = false;
        break;
      }
      for (const child of cfscriptNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes)) {
        if (!addNode(nodes, child, diagnostics, maxNodes, file, sourceMap, child.byte_start)) {
          complete = false;
          break;
        }
      }
      if (!complete) break;
      cursor = closeStart;
      continue;
    }
    if (CFML_EXTENSIONS.has(extensionFor(file)) && node.name.startsWith("cf") && node.name !== "cfquery") {
      cursor = parsed.next;
      continue;
    }
    if (node.name === "cfquery") {
      const closeStart = findClosingTag(text, "cfquery", parsed.next);
      if (closeStart === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "CFML query region is not terminated.", file, sourceMap, parsed.next, text.length));
        complete = false;
      } else if (!addNode(nodes, sqlNode(text, parsed.next, closeStart, sourceMap, file, { statement_kind: "cfquery", datasource: staticAttribute(node, "datasource"), datasource_expression: attribute(node, "datasource")?.value ?? null, datasource_dynamic: staticAttribute(node, "datasource") === null && hasDynamicAttribute(node, ["datasource"]), container_byte_start: node.byte_start }), diagnostics, maxNodes, file, sourceMap, cursor)) {
        complete = false;
        break;
      } else {
        cursor = closeStart;
        continue;
      }
    } else if (node.name === "form") {
      const closeStart = findClosingTag(text, "form", parsed.next);
      if (closeStart === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "HTML form is not terminated.", file, sourceMap, parsed.next, text.length));
        complete = false;
      }
      const closeEnd = closeStart === -1 ? parsed.next : (() => {
        const delimiter = text.indexOf(">", closeStart + 6);
        return delimiter === -1 ? text.length : delimiter + 1;
      })();
      if (!addNode(nodes, {
        kind: "HTML_FORM",
        action: action ?? "",
        action_dynamic: action === null && hasDynamicAttribute(node, ["action"]),
        method: staticAttribute(node, "method") ?? "GET",
        attributes: node.attributes,
        ...nodeSpan(sourceMap, cursor, closeEnd),
      }, diagnostics, maxNodes, file, sourceMap, cursor)) {
        complete = false;
        break;
      }
    } else if (node.name === "link" && (staticAttribute(node, "rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) {
      const href = staticAttribute(node, "href");
      if (!addNode(nodes, {
        kind: "CSS_REFERENCE",
        reference_kind: "stylesheet",
        target: href ?? "",
        dynamic: href === null && hasDynamicAttribute(node, ["href"]),
        ...nodeSpan(sourceMap, cursor, parsed.next),
      }, diagnostics, maxNodes, file, sourceMap, cursor)) {
        complete = false;
        break;
      }
    } else if (node.name === "script") {
      const closeStart = findClosingTag(text, "script", parsed.next);
      if (closeStart === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "HTML script region is not terminated.", file, sourceMap, parsed.next, text.length));
        complete = false;
        break;
      }
      const src = staticAttribute(node, "src");
      if (src !== null || hasDynamicAttribute(node, ["src"])) {
        if (!addNode(nodes, {
          kind: "JS_ASSET",
          target: src ?? "",
          dynamic: src === null,
          ...nodeSpan(sourceMap, cursor, parsed.next),
        }, diagnostics, maxNodes, file, sourceMap, cursor)) {
          complete = false;
          break;
        }
      }
      for (const child of javascriptNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes)) {
        if (!addNode(nodes, child, diagnostics, maxNodes, file, sourceMap, child.byte_start)) {
          complete = false;
          break;
        }
      }
      if (closeStart > parsed.next) cursor = closeStart;
    } else if (node.name === "style") {
      const closeStart = findClosingTag(text, "style", parsed.next);
      if (closeStart === -1) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "HTML style region is not terminated.", file, sourceMap, parsed.next, text.length));
        complete = false;
        break;
      }
      for (const child of cssNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes)) {
        if (!addNode(nodes, child, diagnostics, maxNodes, file, sourceMap, child.byte_start)) {
          complete = false;
          break;
        }
      }
      if (closeStart > parsed.next) cursor = closeStart;
    }
    cursor = parsed.next;
  }
  if (CFML_EXTENSIONS.has(extensionFor(file)) && nodes.length < maxNodes) {
    const queryResult = queryExecuteNodes(text, 0, text.length, sourceMap, file, maxExpressionBytes, maxNodes - nodes.length);
    nodes.push(...queryResult.nodes);
    if (queryResult.limited) {
      diagnostics.push(diagnostic("RESOURCE_LIMIT", "error", `Web parser node limit exceeded: ${maxNodes}.`, file, sourceMap, 0));
      complete = false;
    }
  }
  if (text.trim() !== "") {
    diagnostics.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", "HTML coverage is limited to bounded form, asset, and embedded web-flow structures.", file, sourceMap, 0, text.length));
    complete = false;
  }
  return { nodes, diagnostics, complete };
}

function cssArgument(text, start, end) {
  const cursor = skipWhitespace(text, start, end);
  const quoted = parseQuoted(text, cursor, end);
  if (quoted) return { value: quoted.value, dynamic: false };
  const close = text.indexOf(")", cursor);
  const valueEnd = close === -1 || close > end ? end : close;
  const value = text.slice(cursor, valueEnd).trim();
  return value === "" ? { value: "", dynamic: true } : { value, dynamic: false };
}

function cssNodes(text, start, end, sourceMap, file, maxExpressionBytes) {
  const nodes = [];
  let cursor = start;
  while (cursor < end) {
    if (text.startsWith("/*", cursor)) {
      const close = text.indexOf("*/", cursor + 2);
      cursor = close === -1 ? end : close + 2;
      continue;
    }
    if (text[cursor] === "\"" || text[cursor] === "'") {
      cursor = skipJavaScriptString(text, cursor, end);
      continue;
    }
    if (startsWithInsensitiveAt(text, "@import", cursor) && !/[A-Za-z0-9_-]/u.test(text[cursor - 1] ?? "")) {
      const referenceStart = skipWhitespace(text, cursor + 7, end);
      const parsed = parseQuoted(text, referenceStart, end);
      const target = parsed ?? (startsWithInsensitiveAt(text, "url(", referenceStart) ? cssArgument(text, referenceStart + 4, end) : null);
      if (target) {
        const referenceEnd = parsed?.end ?? Math.min(end, referenceStart + 5 + target.value.length);
        const bounded = boundedValue(text.slice(cursor, Math.min(end, text.indexOf(";", referenceEnd) === -1 ? referenceEnd : text.indexOf(";", referenceEnd) + 1)), maxExpressionBytes);
        nodes.push({ kind: "CSS_REFERENCE", reference_kind: "import", target: target.value, dynamic: target.dynamic === true, expression: bounded.value, expression_truncated: bounded.truncated, ...nodeSpan(sourceMap, cursor, referenceEnd) });
        cursor = referenceEnd;
        continue;
      }
    }
    if (startsWithInsensitiveAt(text, "url(", cursor)) {
      const target = cssArgument(text, cursor + 4, end);
      const close = text.indexOf(")", cursor + 4);
      const referenceEnd = close === -1 ? end : close + 1;
      nodes.push({ kind: "CSS_REFERENCE", reference_kind: "url", target: target.value, dynamic: target.dynamic === true, expression: boundedValue(text.slice(cursor, referenceEnd), maxExpressionBytes).value, ...nodeSpan(sourceMap, cursor, referenceEnd) });
      cursor = referenceEnd;
      continue;
    }
    cursor += 1;
  }
  return nodes;
}

function scanCss(text, sourceMap, file, maxNodes, maxExpressionBytes) {
  const nodes = cssNodes(text, 0, text.length, sourceMap, file, maxExpressionBytes);
  if (nodes.length > maxNodes) return { nodes: nodes.slice(0, maxNodes), diagnostics: [diagnostic("RESOURCE_LIMIT", "error", `Web parser node limit exceeded: ${maxNodes}.`, file, sourceMap, 0)], complete: false };
  const diagnostics = text.trim() === "" ? [] : [diagnostic("UNSUPPORTED_SYNTAX", "warning", "CSS coverage is limited to bounded imports and url() references.", file, sourceMap, 0, text.length)];
  return { nodes, diagnostics, complete: diagnostics.length === 0 };
}

function scanJavaScript(text, sourceMap, file, maxNodes, maxExpressionBytes) {
  const nodes = javascriptNodes(text, 0, text.length, sourceMap, file, maxExpressionBytes);
  if (nodes.length > maxNodes) return { nodes: nodes.slice(0, maxNodes), diagnostics: [diagnostic("RESOURCE_LIMIT", "error", `Web parser node limit exceeded: ${maxNodes}.`, file, sourceMap, 0)], complete: false };
  const diagnostics = text.trim() === "" ? [] : [diagnostic("UNSUPPORTED_SYNTAX", "warning", "JavaScript coverage is limited to bounded fetch and AJAX call structures.", file, sourceMap, 0, text.length)];
  return { nodes, diagnostics, complete: diagnostics.length === 0 };
}

function scanSql(text, sourceMap, file, maxNodes) {
  const ranges = sqlStatementRanges(text, 0, text.length);
  const allNodes = ranges.map((range) => sqlNode(text, range.start, range.end, sourceMap, file, { statement_kind: "visible_sql" }, range.start, range.end));
  const nodes = allNodes.slice(0, maxNodes);
  const diagnostics = [];
  if (maxNodes < 1 || allNodes.length > maxNodes) {
    const limitOffset = ranges[maxNodes]?.start ?? text.length;
    diagnostics.push(diagnostic("RESOURCE_LIMIT", "error", `Web parser node limit exceeded: ${maxNodes}.`, file, sourceMap, limitOffset));
  }
  if (text.trim() !== "") diagnostics.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", "SQL coverage is limited to visible table references.", file, sourceMap, 0, text.length));
  return { nodes, diagnostics, complete: diagnostics.length === 0 };
}

function extensionFor(file) {
  return path.extname(file).toLowerCase();
}

/**
 * Scan bounded web-language structures without evaluating any source.
 * The scanner emits evidence nodes for forms, client calls, CSS references,
 * visible SQL table names, literal-first-argument queryExecute calls, and bounded
 * CFScript linkage forms; it is not a browser or language runtime.
 */
export function createWebScannerBackend({ maxNodes = DEFAULT_MAX_NODES, maxAttributeBytes = DEFAULT_MAX_ATTRIBUTE_BYTES, maxExpressionBytes = DEFAULT_MAX_EXPRESSION_BYTES } = {}) {
  for (const [value, name] of [[maxNodes, "maxNodes"], [maxAttributeBytes, "maxAttributeBytes"], [maxExpressionBytes, "maxExpressionBytes"]]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  }
  return Object.freeze({
    version: "web-structural-scanner/v0.1",
    parse(text, { file, sourceMap }) {
      const extension = extensionFor(file);
      const result = HTML_EXTENSIONS.has(extension)
        ? scanHtml(text, sourceMap, file, maxNodes, maxAttributeBytes, maxExpressionBytes)
        : JAVASCRIPT_EXTENSIONS.has(extension)
          ? scanJavaScript(text, sourceMap, file, maxNodes, maxExpressionBytes)
          : CSS_EXTENSIONS.has(extension)
            ? scanCss(text, sourceMap, file, maxNodes, maxExpressionBytes)
            : SQL_EXTENSIONS.has(extension)
              ? scanSql(text, sourceMap, file, maxNodes)
              : { nodes: [], diagnostics: [], complete: true };
      return {
        tree: { kind: "WEB_STRUCTURAL_DOCUMENT", backend: "web-structural-scanner/v0.1", nodes: result.nodes },
        diagnostics: result.diagnostics,
        complete: result.complete,
      };
    },
  });
}

/**
 * Compose the bounded CFML and web scanners. Parser selection remains explicit
 * because callers must inject this backend into createParserAdapter.
 */
export function createMixedStructuralScannerBackend(options = {}) {
  const cfmlBackend = createCfmlScannerBackend(options);
  const webBackend = createWebScannerBackend(options);
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  return Object.freeze({
    version: "mixed-structural-scanner/v0.1",
    parse(text, context) {
      const extension = extensionFor(context.file);
      const isCfml = extension === ".cfm" || extension === ".cfml" || extension === ".cfc";
      const cfml = isCfml ? cfmlBackend.parse(text, context) : { nodes: [], diagnostics: [], complete: true };
      const web = webBackend.parse(text, context);
      const allNodes = [...(cfml.tree?.nodes ?? []), ...(web.tree?.nodes ?? [])].sort((left, right) => {
        const startDifference = (left.byte_start ?? 0) - (right.byte_start ?? 0);
        if (startDifference !== 0) return startDifference;
        const endDifference = (left.byte_end ?? 0) - (right.byte_end ?? 0);
        if (endDifference !== 0) return endDifference;
        return left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
      });
      const nodes = allNodes.slice(0, maxNodes);
      const diagnostics = [...(cfml.diagnostics ?? []), ...(web.diagnostics ?? [])];
      let complete = cfml.complete === true && web.complete === true;
      if (allNodes.length > maxNodes) {
        const limitNode = allNodes[maxNodes];
        diagnostics.push({
          code: "RESOURCE_LIMIT",
          severity: "error",
          file: context.file,
          message: `Mixed parser node limit exceeded: ${maxNodes}.`,
          ...(limitNode?.span ? { span: limitNode.span } : {}),
        });
        complete = false;
      }
      return {
        tree: { kind: "MIXED_STRUCTURAL_DOCUMENT", backend: "mixed-structural-scanner/v0.1", nodes },
        complete,
        diagnostics,
      };
    },
  });
}
