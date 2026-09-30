const DEFAULT_MAX_NODES = 10_000;
const DEFAULT_MAX_ATTRIBUTE_BYTES = 4_096;
const EXPRESSION_TAGS = new Set(["cfabort", "cfelseif", "cfexit", "cfif", "cfreturn", "cfset", "cfthrow"]);
// Recognition is structural only; Fact extraction remains a separate bounded stage.
const SUPPORTED_CFML_TAGS = new Set([
  "cfabort",
  "cfadmin",
  "cfargument",
  "cfbreak",
  "cfcase",
  "cfcatch",
  "cfcomponent",
  "cfcontent",
  "cfcontinue",
  "cfdefaultcase",
  "cfdirectory",
  "cfdump",
  "cfelse",
  "cfelseif",
  "cfexit",
  "cffeed",
  "cffunction",
  "cfheader",
  "cfhttp",
  "cfhttpparam",
  "cfif",
  "cfinclude",
  "cfimport",
  "cfinterface",
  "cfinvoke",
  "cflocation",
  "cflog",
  "cfloop",
  "cfmail",
  "cfmailparam",
  "cfmailpart",
  "cfmodule",
  "cfobject",
  "cfoutput",
  "cfparam",
  "cfproperty",
  "cfquery",
  "cfqueryparam",
  "cfreturn",
  "cfsavecontent",
  "cfsilent",
  "cfscript",
  "cfset",
  "cfsetting",
  "cfswitch",
  "cfthrow",
  "cfthread",
  "cftransaction",
  "cftry",
  "cfftp",
]);
const BLOCK_TAGS = new Set([
  "cfcatch",
  "cfcomponent",
  "cffunction",
  "cfif",
  "cfhttp",
  "cfinterface",
  "cfloop",
  "cfmail",
  "cfmailpart",
  "cfoutput",
  "cfquery",
  "cfsavecontent",
  "cfsilent",
  "cfscript",
  "cfswitch",
  "cfthread",
  "cftransaction",
  "cftry",
]);
const BRANCH_PARENT_TAGS = Object.freeze({
  cfcase: "cfswitch",
  cfcatch: "cftry",
  cfdefaultcase: "cfswitch",
  cfelse: "cfif",
  cfelseif: "cfif",
});

function startsWithAt(text, value, offset) {
  return text.startsWith(value, offset);
}

function startsWithInsensitiveAt(text, value, offset) {
  if (offset + value.length > text.length) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (text[offset + index].toLowerCase() !== value[index].toLowerCase()) return false;
  }
  return true;
}

function isNameCharacter(character) {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === "_" || character === ":" || character === "-";
}

function containsCall(text, name) {
  let cursor = 0;
  let quote = null;
  while (cursor < text.length) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === "\\") cursor += 2;
      else {
        if (character === quote) quote = null;
        cursor += 1;
      }
      continue;
    }
    if (text.startsWith("//", cursor)) {
      const lineEnd = text.indexOf("\n", cursor + 2);
      cursor = lineEnd === -1 ? text.length : lineEnd + 1;
      continue;
    }
    if (text.startsWith("/*", cursor)) {
      const blockEnd = text.indexOf("*/", cursor + 2);
      cursor = blockEnd === -1 ? text.length : blockEnd + 2;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (text.slice(cursor, cursor + name.length).toLowerCase() === name.toLowerCase() && !/[A-Za-z0-9_$]/u.test(text[cursor - 1] ?? "") && !/[A-Za-z0-9_$]/u.test(text[cursor + name.length] ?? "")) {
      let after = cursor + name.length;
      while (isWhitespace(text[after])) after += 1;
      if (text[after] === "(") return true;
    }
    cursor += 1;
  }
  return false;
}

function isWhitespace(character) {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
}

function diagnostic(code, severity, message, file, sourceMap, start, end = start) {
  let span;
  try {
    span = sourceMap.spanFromTextOffsets(start, end);
  } catch {
    span = undefined;
  }
  return {
    code,
    severity,
    file,
    message,
    ...(span ? { span } : {}),
  };
}

function boundedValue(text, maxBytes) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { value: text, truncated: false };
  let end = text.length;
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) end -= 1;
  return { value: text.slice(0, end), truncated: true };
}

function scanTag(text, start, sourceMap, file, maxAttributeBytes) {
  let cursor = start + 1;
  let closing = false;
  if (text[cursor] === "/") {
    closing = true;
    cursor += 1;
  }
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
      error: diagnostic("PARSE_PARTIAL", "error", "Tag is missing a complete closing delimiter.", file, sourceMap, start, text.length),
      next: text.length,
    };
  }

  const attributes = [];
  let expression = null;
  let expressionSpan = null;
  let boundedExpressionTruncated = false;
  if (!closing && EXPRESSION_TAGS.has(name)) {
    const expressionStart = cursor;
    while (cursor < end && isWhitespace(text[cursor])) cursor += 1;
    const expressionEnd = text[end - 1] === "/" ? end - 1 : end;
    const bounded = boundedValue(text.slice(cursor, expressionEnd).trim(), maxAttributeBytes);
    expression = bounded.value;
    boundedExpressionTruncated = bounded.truncated;
    expressionSpan = sourceMap.spanFromTextOffsets(expressionStart, expressionEnd);
  } else if (!closing) {
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
      let valueStart = null;
      let valueEnd = null;
      let valueQuote = null;
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
        const rawValue = text.slice(valueStart, valueEnd ?? cursor);
        const bounded = boundedValue(rawValue, maxAttributeBytes);
        value = bounded.value;
        if (bounded.truncated) {
          attributes.push({
            name: attributeName,
            value,
            quote: valueQuote,
            truncated: true,
            span: sourceMap.spanFromTextOffsets(attributeStart, cursor),
          });
          continue;
        }
      }
      attributes.push({
        name: attributeName,
        value,
        quote: valueQuote,
        span: sourceMap.spanFromTextOffsets(attributeStart, cursor),
      });
    }
  }

  const selfClosing = !closing && text[end - 1] === "/";
  return {
    node: {
      kind: "CFML_TAG",
      name,
      closing,
      self_closing: selfClosing,
      supported: !name.startsWith("cf") || SUPPORTED_CFML_TAGS.has(name),
      attributes,
      ...(expression !== null ? { expression, expression_span: expressionSpan, expression_truncated: boundedExpressionTruncated } : {}),
      span: sourceMap.spanFromTextOffsets(start, end + 1),
      byte_start: sourceMap.textOffsetToByteOffset(start),
      byte_end: sourceMap.textOffsetToByteOffset(end + 1),
    },
    next: end + 1,
  };
}

function findClosingTag(text, name, start) {
  const needle = `</${name}`;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    if (startsWithInsensitiveAt(text, needle, cursor)) {
      const afterName = text[cursor + needle.length];
      if (afterName === ">" || isWhitespace(afterName)) return cursor;
    }
  }
  return -1;
}

function addNode(nodes, node, diagnostics, maxNodes, file, sourceMap, offset) {
  if (nodes.length >= maxNodes) {
    diagnostics.push(diagnostic("RESOURCE_LIMIT", "error", `Parser node limit exceeded: ${maxNodes}.`, file, sourceMap, offset));
    return false;
  }
  nodes.push(node);
  return true;
}

/**
 * A conservative, dependency-free CFML structural scanner backend.
 * It recognizes bounded CFML tags and opaque script regions; it is not a
 * general CFML grammar and intentionally reports unsupported regions.
 */
export function createCfmlScannerBackend({ maxNodes = DEFAULT_MAX_NODES, maxAttributeBytes = DEFAULT_MAX_ATTRIBUTE_BYTES } = {}) {
  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0) throw new TypeError("maxNodes must be a positive safe integer");
  if (!Number.isSafeInteger(maxAttributeBytes) || maxAttributeBytes <= 0) throw new TypeError("maxAttributeBytes must be a positive safe integer");

  return Object.freeze({
    version: "cfml-structural-scanner/v0.1",
    parse(text, { file, sourceMap }) {
      const nodes = [];
      const diagnostics = [];
      let complete = true;
      let cursor = 0;
      const blockStack = [];

      while (cursor < text.length) {
        if (startsWithAt(text, "<!---", cursor)) {
          const end = text.indexOf("--->", cursor + 5);
          if (end === -1) {
            diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "CFML comment is not terminated.", file, sourceMap, cursor, text.length));
            complete = false;
            break;
          }
          cursor = end + 4;
          continue;
        }
        if (startsWithAt(text, "<!--", cursor)) {
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

        const parsed = scanTag(text, cursor, sourceMap, file, maxAttributeBytes);
        if (parsed === null) {
          cursor += 1;
          continue;
        }
        if (parsed.error) {
          diagnostics.push(parsed.error);
          complete = false;
          break;
        }
        const { node } = parsed;
        if (node.name.startsWith("cf")) {
          if (!node.supported) {
            diagnostics.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", `CFML tag is outside the bounded scanner subset: ${node.name}.`, file, sourceMap, cursor, parsed.next));
            complete = false;
          }
          if (node.attributes.some((attribute) => attribute.truncated) || node.expression_truncated === true) {
            diagnostics.push(diagnostic("RESOURCE_LIMIT", "warning", `Tag value exceeded the ${maxAttributeBytes}-byte bounded field limit.`, file, sourceMap, cursor, parsed.next));
            complete = false;
          }
          const branchParent = BRANCH_PARENT_TAGS[node.name];
          if (!node.closing && branchParent !== undefined && blockStack.at(-1) !== branchParent) {
            diagnostics.push(diagnostic("PARSE_PARTIAL", "error", `CFML branch tag ${node.name} must occur inside ${branchParent}.`, file, sourceMap, cursor, parsed.next));
            complete = false;
            break;
          }
          if (node.closing && BLOCK_TAGS.has(node.name)) {
            const expected = blockStack.at(-1);
            if (expected !== node.name) {
              diagnostics.push(diagnostic("PARSE_PARTIAL", "error", `Unexpected closing CFML tag ${node.name}; expected ${expected ?? "none"}.`, file, sourceMap, cursor, parsed.next));
              complete = false;
              break;
            }
            blockStack.pop();
          }
          if (!node.closing && !node.self_closing && BLOCK_TAGS.has(node.name)) blockStack.push(node.name);
          if (!addNode(nodes, node, diagnostics, maxNodes, file, sourceMap, cursor)) {
            complete = false;
            break;
          }
          if (!node.closing && node.name === "cfscript") {
            const bodyStart = parsed.next;
            const closingStart = findClosingTag(text, "cfscript", bodyStart);
            if (closingStart === -1) {
              diagnostics.push(diagnostic("PARSE_PARTIAL", "error", "CFScript region is not terminated.", file, sourceMap, bodyStart, text.length));
              complete = false;
              break;
            }
            if (closingStart > bodyStart) {
              const body = text.slice(bodyStart, closingStart);
              const dynamicConstructs = containsCall(body, "evaluate") ? ["evaluate"] : [];
              if (!addNode(nodes, {
                kind: "OPAQUE_REGION",
                name: "cfscript",
                parsed: false,
                ...(dynamicConstructs.length > 0 ? { dynamic_constructs: dynamicConstructs } : {}),
                span: sourceMap.spanFromTextOffsets(bodyStart, closingStart),
                byte_start: sourceMap.textOffsetToByteOffset(bodyStart),
                byte_end: sourceMap.textOffsetToByteOffset(closingStart),
              }, diagnostics, maxNodes, file, sourceMap, bodyStart)) {
                complete = false;
                break;
              }
              diagnostics.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", "CFScript body is preserved as an opaque region until a script parser is selected.", file, sourceMap, bodyStart, closingStart));
              complete = false;
            }
            cursor = closingStart;
            continue;
          }
        } else if (!node.closing && (node.name === "script" || node.name === "style")) {
          const closingStart = findClosingTag(text, node.name, parsed.next);
          if (closingStart === -1) {
            diagnostics.push(diagnostic("PARSE_PARTIAL", "error", `HTML ${node.name} region is not terminated.`, file, sourceMap, parsed.next, text.length));
            complete = false;
            break;
          }
          diagnostics.push(diagnostic("UNSUPPORTED_SYNTAX", "warning", `Embedded ${node.name} is preserved as an opaque region.`, file, sourceMap, parsed.next, closingStart));
          complete = false;
          cursor = closingStart;
          continue;
        }
        cursor = parsed.next;
      }

      if (complete && blockStack.length > 0) {
        diagnostics.push(diagnostic("PARSE_PARTIAL", "error", `CFML block tag is not terminated: ${blockStack.at(-1)}.`, file, sourceMap, text.length, text.length));
        complete = false;
      }

      return {
        tree: {
          kind: "CFML_STRUCTURAL_DOCUMENT",
          backend: "cfml-structural-scanner/v0.1",
          nodes,
        },
        complete,
        diagnostics,
      };
    },
  });
}
