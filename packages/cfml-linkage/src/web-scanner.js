import path from "node:path";

import { createCfmlScannerBackend } from "./cfml-scanner.js";
import { findCfscriptClose, isScriptCfcSource, scanCfmlComment, scanCfscript } from "./cfscript-scanner.js";

const DEFAULT_MAX_NODES = 10_000;
const DEFAULT_MAX_ATTRIBUTE_BYTES = 4_096;
const DEFAULT_MAX_EXPRESSION_BYTES = 4_096;
const HTML_EXTENSIONS = new Set([".cfm", ".cfml", ".cfc", ".html", ".htm"]);
const CFML_EXTENSIONS = new Set([".cfm", ".cfml", ".cfc"]);
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs"]);
const CSS_EXTENSIONS = new Set([".css"]);
const SQL_EXTENSIONS = new Set([".sql"]);

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

function htmlWhitespace(character) {
  return character !== undefined && /[ \t\r\n\f]/u.test(character);
}

function parseTag(text, start, sourceMap, file, maxAttributeBytes) {
  let cursor = start + 1;
  const closing = text[cursor] === "/";
  if (closing) cursor += 1;
  if (!/[A-Za-z]/u.test(text[cursor] ?? "")) return null;
  const nameStart = cursor;
  while (isNameCharacter(text[cursor])) cursor += 1;
  const name = text.slice(nameStart, cursor).toLowerCase();
  const fail = (message, offset = cursor, code = "PARSE_PARTIAL") => ({
    error: diagnostic(code, "error", message, file, sourceMap, offset, Math.min(text.length, offset + 1)),
    next: text.length,
  });
  if (Buffer.byteLength(name, "utf8") > maxAttributeBytes) return fail("HTML tag name exceeds the field limit.", nameStart, "RESOURCE_LIMIT");
  const attributes = [];
  const names = new Set();
  const attributesStart = cursor;
  let selfClosing = false;
  while (cursor < text.length) {
    const separator = cursor;
    while (htmlWhitespace(text[cursor])) cursor += 1;
    if (Buffer.byteLength(text.slice(attributesStart, cursor), "utf8") > maxAttributeBytes) return fail("HTML attribute region exceeds the field limit.", attributesStart, "RESOURCE_LIMIT");
    if (text[cursor] === ">") {
      return {
        node: { kind: "HTML_TAG", name, closing, self_closing: selfClosing, attributes, ...nodeSpan(sourceMap, start, cursor + 1) },
        next: cursor + 1,
      };
    }
    if (text[cursor] === "/" && text[cursor + 1] === ">" && !closing) {
      selfClosing = true;
      cursor += 1;
      continue;
    }
    if (closing) return fail("HTML closing tag contains unsupported attributes or delimiters.");
    if (separator === cursor) return fail("HTML attributes must be separated by whitespace.");
    const attributeStart = cursor;
    if (!/[A-Za-z_:]/u.test(text[cursor] ?? "")) return fail("HTML attribute name is malformed.");
    while (isNameCharacter(text[cursor])) cursor += 1;
    const attributeName = text.slice(attributeStart, cursor).toLowerCase();
    if (names.has(attributeName)) return fail("HTML tag contains an ambiguous duplicate attribute.", attributeStart);
    names.add(attributeName);
    const nameEnd = cursor;
    while (htmlWhitespace(text[cursor])) cursor += 1;
    let value = null;
    let valueQuote = null;
    if (text[cursor] === "=") {
      cursor += 1;
      while (htmlWhitespace(text[cursor])) cursor += 1;
      let valueStart = cursor;
      if (text[cursor] === "\"" || text[cursor] === "'") {
        valueQuote = text[cursor++];
        valueStart = cursor;
        while (cursor < text.length && text[cursor] !== valueQuote) cursor += 1;
        if (cursor === text.length) return fail("HTML attribute string is not terminated.", attributeStart);
        value = text.slice(valueStart, cursor++);
        if (value.includes("\0")) return fail("HTML attribute contains a tokenizer replacement character.", attributeStart);
      } else {
        while (cursor < text.length && !htmlWhitespace(text[cursor]) && text[cursor] !== ">") {
          if (/["'`=<>\0]/u.test(text[cursor])) return fail("HTML unquoted attribute value is malformed.");
          cursor += 1;
        }
        if (cursor === valueStart) return fail("HTML attribute is missing its value.", attributeStart);
        value = text.slice(valueStart, cursor);
      }
    } else {
      // Leave whitespace for the next attribute's separator check.
      cursor = nameEnd;
    }
    if (Buffer.byteLength(text.slice(attributesStart, cursor), "utf8") > maxAttributeBytes) return fail("HTML attribute region exceeds the field limit.", attributeStart, "RESOURCE_LIMIT");
    attributes.push({ name: attributeName, value, quote: valueQuote, span: sourceMap.spanFromTextOffsets(attributeStart, cursor) });
  }
  return fail("HTML tag is missing a complete closing delimiter.", start);
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

const HTML_VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const HTML_PAIRED_TAGS = new Set([
  "a", "abbr", "address", "article", "aside", "audio", "b", "bdi", "bdo", "blockquote", "body", "button", "canvas", "caption",
  "cite", "code", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "html", "i",
  "ins", "kbd", "label", "legend", "li", "main", "map", "mark", "menu", "meter", "nav", "ol", "optgroup", "option", "output",
  "p", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "search", "section", "select", "small",
  "span", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time",
  "title", "tr", "u", "ul", "var", "video",
]);
const HTML_RAW_TAGS = new Set(["script", "style", "textarea", "title"]);
const HTML_OPAQUE_TAGS = new Set(["svg", "math", "template", "noscript", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const HTML_BLOCK_TAGS = new Set(["address", "article", "aside", "blockquote", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "menu", "nav", "ol", "p", "pre", "search", "section", "summary", "table", "ul"]);
const HTML_TABLE_CHILDREN = new Map([
  ["table", new Set(["caption", "colgroup", "thead", "tbody", "tfoot", "script", "style"])],
  ["colgroup", new Set(["col"])],
  ["thead", new Set(["tr"])], ["tbody", new Set(["tr"])], ["tfoot", new Set(["tr"])],
  ["tr", new Set(["td", "th"])],
  ["select", new Set(["option", "optgroup"])], ["optgroup", new Set(["option"])],
]);

function htmlNeedsRecovery(name, stack) {
  const parent = stack.at(-1)?.name;
  if (stack.some((entry) => entry.name === "select") && !["option", "optgroup", "script"].includes(name)) return true;
  if (/^h[1-6]$/u.test(name) && stack.some((entry) => /^h[1-6]$/u.test(entry.name))) return true;
  if (["rt", "rp"].includes(name) && parent !== "ruby") return true;
  if (HTML_TABLE_CHILDREN.has(parent) && !HTML_TABLE_CHILDREN.get(parent).has(name)) return true;
  if (["caption", "colgroup", "thead", "tbody", "tfoot"].includes(name) && parent !== "table") return true;
  if (name === "col" && parent !== "colgroup") return true;
  if (name === "tr" && !["thead", "tbody", "tfoot"].includes(parent)) return true;
  if (["td", "th"].includes(name) && parent !== "tr") return true;
  if (name === "li" && !["ol", "ul", "menu"].includes(parent)) return true;
  if (["dt", "dd"].includes(name) && parent !== "dl") return true;
  if (name === "option" && !["select", "optgroup", "datalist"].includes(parent)) return true;
  if (name === "optgroup" && parent !== "select") return true;
  if (HTML_BLOCK_TAGS.has(name) && stack.some((entry) => entry.name === "p")) return true;
  if (["form", "a", "button", "head", "body", "html"].includes(name) && stack.some((entry) => entry.name === name)) return true;
  if (name === "html" && stack.length !== 0) return true;
  if (["head", "body"].includes(name) && parent !== "html") return true;
  if (parent === "html" && !["head", "body"].includes(name)) return true;
  if (parent === "head" && !["base", "link", "meta", "title", "style", "script"].includes(name)) return true;
  return false;
}

function htmlRawClosingTag(text, name, start) {
  const needle = `</${name}`;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    if (!startsWithInsensitiveAt(text, needle, cursor)) continue;
    const boundary = text[cursor + needle.length];
    if (boundary === ">" || boundary === "/" || htmlWhitespace(boundary)) return cursor;
  }
  return -1;
}

function htmlCfmlTagEnd(text, start) {
  let quote = null;
  for (let cursor = start + 1; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (quote !== null) {
      if (character === quote && text[cursor + 1] === quote) cursor += 1;
      else if (character === quote) quote = null;
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === ">") return cursor + 1;
  }
  return -1;
}

function htmlLiteralCfset(text, start, end) {
  const expression = text.slice(start + 6, end - 1).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*[ \t\r\n\f]*=[ \t\r\n\f]*(?:true|false|[+-]?(?:\d+(?:\.\d*)?|\.\d+)|"(?:[^"#\0]|"")*"|'(?:[^'#\0]|'')*')[ \t\r\n\f]*\/?$/iu.test(expression);
}

function scanHtml(text, sourceMap, file, maxNodes, maxAttributeBytes, maxExpressionBytes, includeCfscript = true) {
  const nodes = [];
  const diagnostics = [];
  const stack = [];
  const cfml = CFML_EXTENSIONS.has(extensionFor(file));
  let complete = true;
  let cursor = 0;
  let elementCount = 0;
  let doctypeSeen = false;
  const documentSections = new Set();
  let documentClosed = false;
  const report = (code, message, start, end = start + 1) => {
    diagnostics.push(diagnostic(code, code === "UNSUPPORTED_SYNTAX" ? "warning" : "error", message, file, sourceMap, start, Math.min(text.length, end)));
    complete = false;
  };
  const append = (node, offset) => {
    if (addNode(nodes, node, diagnostics, maxNodes, file, sourceMap, offset)) return true;
    complete = false;
    return false;
  };
  const literalAttribute = (node, name) => {
    const value = staticAttribute(node, name);
    return value !== null && !value.includes("&") ? value : null;
  };
  const uncertainAttribute = (node, name) => hasDynamicAttribute(node, [name]) || (attribute(node, name)?.value?.includes("&") ?? false);
  while (cursor < text.length) {
    if (cfml && text.startsWith("<!---", cursor)) {
      const comment = scanCfmlComment(text, cursor);
      if (comment.code) {
        report(comment.code, "CFML comment is unterminated or exceeds the nesting limit.", cursor, comment.next);
        break;
      }
      cursor = comment.next;
      continue;
    }
    if (text.startsWith("<!--", cursor)) {
      const end = text.indexOf("-->", cursor + 4);
      if (end === -1) {
        report("PARSE_PARTIAL", "HTML comment is not terminated.", cursor, text.length);
        break;
      }
      const body = text.slice(cursor + 4, end);
      if (body.includes("--") || body.startsWith(">") || body.startsWith("->") || body.endsWith("<!")) report("PARSE_PARTIAL", "HTML comment requires unsupported tokenizer recovery.", cursor, end + 3);
      cursor = end + 3;
      continue;
    }
    if (startsWithInsensitiveAt(text, "<!doctype", cursor)) {
      const end = text.indexOf(">", cursor + 9);
      if (end === -1) {
        report("PARSE_PARTIAL", "HTML document type is not terminated.", cursor, text.length);
        break;
      }
      if (!/^<!doctype[ \t\r\n\f]+html[ \t\r\n\f]*>$/iu.test(text.slice(cursor, end + 1)) || doctypeSeen || elementCount > 0 || text.slice(0, cursor).replace(/<!--[\s\S]*?-->/gu, "").trim() !== "") {
        report("UNSUPPORTED_SYNTAX", "HTML document type is outside the admitted literal subset.", cursor, end + 1);
      }
      doctypeSeen = true;
      cursor = end + 1;
      continue;
    }
    if (text[cursor] !== "<") {
      const next = text.indexOf("<", cursor);
      const end = next === -1 ? text.length : next;
      const content = text.slice(cursor, end);
      if (cfml && content.includes("#")) report("UNSUPPORTED_SYNTAX", "CFML text interpolation can change emitted HTML structure.", cursor, end);
      if (content.includes("\0")) report("PARSE_PARTIAL", "HTML text contains a tokenizer replacement character.", cursor, end);
      if (content.trim() !== "" && (documentClosed || HTML_TABLE_CHILDREN.has(stack.at(-1)?.name) || ["html", "head"].includes(stack.at(-1)?.name))) report("UNSUPPORTED_SYNTAX", "HTML text requires unsupported tree-building recovery.", cursor, end);
      cursor = end;
      continue;
    }
    const cfmlName = cfml ? /^<\/?(cf[A-Za-z0-9_:-]*)\b/iu.exec(text.slice(cursor, cursor + 128))?.[1]?.toLowerCase() : null;
    if (cfmlName && !["cfscript", "cfquery"].includes(cfmlName)) {
      const end = htmlCfmlTagEnd(text, cursor);
      if (end === -1) {
        report("PARSE_PARTIAL", "CFML island is missing a complete closing delimiter.", cursor, text.length);
        break;
      }
      if (++elementCount > maxNodes) { report("RESOURCE_LIMIT", "HTML structural element limit exceeded.", cursor); break; }
      if (Buffer.byteLength(text.slice(cursor, end), "utf8") > maxAttributeBytes) {
        report("RESOURCE_LIMIT", "CFML island exceeds the HTML field limit.", cursor, end);
        break;
      }
      let harmless = cfmlName === "cfset" && !text.startsWith("</", cursor) && htmlLiteralCfset(text, cursor, end);
      if (cfmlName === "cfparam" && !text.startsWith("</", cursor)) {
        const parameter = parseTag(text, cursor, sourceMap, file, maxAttributeBytes);
        if (parameter?.error) { diagnostics.push(parameter.error); complete = false; break; }
        const parameterNode = parameter?.node;
        harmless = parameterNode !== undefined && typeof attribute(parameterNode, "name")?.value === "string"
          && /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u.test(attribute(parameterNode, "name").value)
          && parameterNode.attributes.every((item) => ["name", "default", "type", "min", "max", "pattern"].includes(item.name) && typeof item.value === "string" && !/[#&\0]/u.test(item.value));
      }
      if (!text.startsWith("</", cursor) && ["cfset", "cfreturn"].includes(cfmlName)) {
        const queries = queryExecuteNodes(text, cursor + cfmlName.length + 1, end - 1, sourceMap, file, maxExpressionBytes, maxNodes - nodes.length);
        nodes.push(...queries.nodes);
        if (queries.limited) { report("RESOURCE_LIMIT", "Embedded queryExecute node limit exceeded.", cursor, end); break; }
      }
      if (!harmless) report("UNSUPPORTED_SYNTAX", "CFML island output and control semantics are outside HTML structural coverage.", cursor, end);
      cursor = end;
      continue;
    }
    const parsed = parseTag(text, cursor, sourceMap, file, maxAttributeBytes);
    if (parsed === null) {
      report("PARSE_PARTIAL", "HTML markup opener is malformed or unsupported.", cursor);
      break;
    }
    if (parsed.error) {
      diagnostics.push(parsed.error);
      complete = false;
      break;
    }
    const node = parsed.node;
    if (node.closing) {
      const open = stack.at(-1);
      if (HTML_VOID_TAGS.has(node.name) || !open || open.name !== node.name) {
        report("PARSE_PARTIAL", "HTML closing tag does not match the open element stack.", cursor, parsed.next);
        break;
      }
      stack.pop();
      if (node.name === "html") documentClosed = true;
      if (open.form) Object.assign(open.form, nodeSpan(sourceMap, open.start, parsed.next));
      cursor = parsed.next;
      continue;
    }
    if (++elementCount > maxNodes) { report("RESOURCE_LIMIT", "HTML structural element limit exceeded.", cursor); break; }
    if (documentClosed) report("UNSUPPORTED_SYNTAX", "HTML markup follows the closed document element.", cursor, parsed.next);
    if (["html", "head", "body"].includes(node.name)) {
      if (documentSections.has(node.name) || (node.name === "head" && documentSections.has("body"))) report("UNSUPPORTED_SYNTAX", "HTML document sections require unsupported tree-building recovery.", cursor, parsed.next);
      documentSections.add(node.name);
    }
    if (node.attributes.some((item) => item.name.includes(":") || item.name === "xmlns" || item.name === "is" || item.value?.includes("&") || (cfml && item.value?.includes("#")))) {
      report("UNSUPPORTED_SYNTAX", "HTML attributes contain dynamic, encoded, or namespace-dependent semantics.", cursor, parsed.next);
    }
    if (node.attributes.some((item) => item.name.startsWith("on") || item.name === "style")) {
      report("UNSUPPORTED_SYNTAX", "Embedded attribute language is outside bounded HTML structural coverage.", cursor, parsed.next);
    }
    if (cfml && ["cfscript", "cfquery"].includes(node.name)) {
      const closeStart = node.name === "cfscript" ? findCfscriptClose(text, parsed.next) : findClosingTag(text, node.name, parsed.next);
      if (closeStart === -1) { report("PARSE_PARTIAL", "CFML embedded region is not terminated.", cursor, text.length); break; }
      const close = parseTag(text, closeStart, sourceMap, file, maxAttributeBytes);
      if (!close || close.error) {
        if (close?.error) diagnostics.push(close.error);
        else report("PARSE_PARTIAL", "CFML embedded closing delimiter is malformed.", closeStart);
        complete = false;
        break;
      }
      if (node.self_closing || node.attributes.length > 0 && node.name === "cfscript") report("UNSUPPORTED_SYNTAX", "CFML script delimiter contains unsupported syntax.", cursor, parsed.next);
      if (node.name === "cfscript" && includeCfscript) {
        const script = scanCfscript(text, parsed.next, closeStart, sourceMap, file, { maxNodes: Math.max(1, maxNodes - nodes.length), maxExpressionBytes });
        diagnostics.push(...script.diagnostics);
        complete = complete && script.complete;
        for (const child of script.nodes) {
          if (!append(child, parsed.next)) break;
        }
      } else if (node.name === "cfquery") {
        if (!append(sqlNode(text, parsed.next, closeStart, sourceMap, file, { statement_kind: "cfquery", datasource: staticAttribute(node, "datasource"), datasource_expression: attribute(node, "datasource")?.value ?? null, datasource_dynamic: staticAttribute(node, "datasource") === null && hasDynamicAttribute(node, ["datasource"]), container_byte_start: node.byte_start }), cursor)) break;
        report("UNSUPPORTED_SYNTAX", "SQL query semantics are outside HTML structural coverage.", parsed.next, closeStart);
      }
      if (node.name === "cfscript") {
        const queries = queryExecuteNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes, maxNodes - nodes.length);
        nodes.push(...queries.nodes);
        if (queries.nodes.length > 0) report("UNSUPPORTED_SYNTAX", "SQL query semantics are outside HTML structural coverage.", parsed.next, closeStart);
        if (queries.limited) { report("RESOURCE_LIMIT", "Web parser node limit exceeded in CFScript query extraction.", parsed.next); break; }
      }
      cursor = close.next;
      continue;
    }
    if (!HTML_VOID_TAGS.has(node.name) && !HTML_PAIRED_TAGS.has(node.name)) report("UNSUPPORTED_SYNTAX", "HTML element is outside the admitted ordinary-markup subset.", cursor, parsed.next);
    if (htmlNeedsRecovery(node.name, stack)) {
      report("UNSUPPORTED_SYNTAX", "HTML nesting requires unsupported tree-building recovery.", cursor, parsed.next);
      // An ignored or implicitly relocated element cannot yield reliable facts.
      break;
    }
    if (node.self_closing && !HTML_VOID_TAGS.has(node.name)) report("PARSE_PARTIAL", "HTML non-void element uses an unsupported self-closing delimiter.", cursor, parsed.next);
    if (HTML_OPAQUE_TAGS.has(node.name)) {
      // Foreign, template and legacy raw contexts cannot safely yield HTML facts.
      report("UNSUPPORTED_SYNTAX", "HTML context requires unsupported foreign or tokenizer semantics.", cursor, parsed.next);
      break;
    }
    const open = { name: node.name, start: cursor };
    if (node.name === "form") {
      const action = literalAttribute(node, "action");
      open.form = { kind: "HTML_FORM", action: action ?? "", action_dynamic: action === null && uncertainAttribute(node, "action"), method: literalAttribute(node, "method") ?? "GET", attributes: node.attributes, ...nodeSpan(sourceMap, cursor, parsed.next) };
      if (!append(open.form, cursor)) break;
    } else if (node.name === "link" && (literalAttribute(node, "rel") ?? "").toLowerCase().split(/\s+/u).includes("stylesheet")) {
      const href = literalAttribute(node, "href");
      if (!append({ kind: "CSS_REFERENCE", reference_kind: "stylesheet", target: href ?? "", dynamic: href === null && uncertainAttribute(node, "href"), ...nodeSpan(sourceMap, cursor, parsed.next) }, cursor)) break;
    }
    if (HTML_RAW_TAGS.has(node.name)) {
      const closeStart = htmlRawClosingTag(text, node.name, parsed.next);
      if (closeStart === -1) { report("PARSE_PARTIAL", "HTML raw-text or RCDATA region is not terminated.", cursor, text.length); break; }
      const close = parseTag(text, closeStart, sourceMap, file, maxAttributeBytes);
      if (!close || close.error) {
        if (close?.error) diagnostics.push(close.error);
        else report("PARSE_PARTIAL", "HTML raw-text closing delimiter is malformed.", closeStart);
        complete = false;
        break;
      }
      const body = text.slice(parsed.next, closeStart);
      if (cfml && (body.includes("#") || /<\/?cf[A-Za-z]/iu.test(body))) report("UNSUPPORTED_SYNTAX", "CFML interpolation or islands in an embedded region remain dynamic.", parsed.next, closeStart);
      if (body.includes("\0")) report("PARSE_PARTIAL", "HTML embedded text contains a tokenizer replacement character.", parsed.next, closeStart);
      if (node.name === "script") {
        const src = literalAttribute(node, "src");
        if (src !== null || uncertainAttribute(node, "src")) {
          if (!append({ kind: "JS_ASSET", target: src ?? "", dynamic: src === null, ...nodeSpan(sourceMap, cursor, parsed.next) }, cursor)) break;
        }
        const type = (literalAttribute(node, "type") ?? "").toLowerCase();
        if (!["", "module", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript"].includes(type) || uncertainAttribute(node, "type")) {
          report("UNSUPPORTED_SYNTAX", "HTML script language is outside the admitted embedded-language subset.", cursor, parsed.next);
        } else {
          for (const child of javascriptNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes)) {
            if (!append(child, parsed.next)) break;
          }
        }
        if (body.trim() !== "") report("UNSUPPORTED_SYNTAX", "JavaScript coverage is limited to bounded fetch and AJAX call structures.", parsed.next, closeStart);
        if (body.includes("<!--")) { report("UNSUPPORTED_SYNTAX", "HTML escaped-script tokenizer states are not admitted.", parsed.next, closeStart); break; }
      } else if (node.name === "style") {
        const type = (literalAttribute(node, "type") ?? "").toLowerCase();
        if (!["", "text/css"].includes(type) || uncertainAttribute(node, "type")) {
          report("UNSUPPORTED_SYNTAX", "HTML style language is outside the admitted embedded-language subset.", cursor, parsed.next);
        } else {
          for (const child of cssNodes(text, parsed.next, closeStart, sourceMap, file, maxExpressionBytes)) {
            if (!append(child, parsed.next)) break;
          }
        }
        if (body.trim() !== "") report("UNSUPPORTED_SYNTAX", "CSS coverage is limited to bounded imports and url() references.", parsed.next, closeStart);
      }
      cursor = close.next;
      continue;
    }
    if (!HTML_VOID_TAGS.has(node.name)) stack.push(open);
    cursor = parsed.next;
  }
  if (stack.length > 0) report("PARSE_PARTIAL", "HTML element is missing its matching closing tag.", stack.at(-1).start, text.length);
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
export function createWebScannerBackend({ maxNodes = DEFAULT_MAX_NODES, maxAttributeBytes = DEFAULT_MAX_ATTRIBUTE_BYTES, maxExpressionBytes = DEFAULT_MAX_EXPRESSION_BYTES, includeCfscript = true } = {}) {
  for (const [value, name] of [[maxNodes, "maxNodes"], [maxAttributeBytes, "maxAttributeBytes"], [maxExpressionBytes, "maxExpressionBytes"]]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  }
  if (typeof includeCfscript !== "boolean") throw new TypeError("includeCfscript must be a boolean");
  return Object.freeze({
    version: "web-structural-scanner/v0.1",
    parse(text, { file, sourceMap }) {
      const extension = extensionFor(file);
      const result = includeCfscript && extension === ".cfc" && isScriptCfcSource(text)
        ? scanCfscript(text, 0, text.length, sourceMap, file, { maxNodes, maxExpressionBytes, scriptCfc: true })
        : HTML_EXTENSIONS.has(extension)
          ? scanHtml(text, sourceMap, file, maxNodes, maxAttributeBytes, maxExpressionBytes, includeCfscript)
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
  const webBackend = createWebScannerBackend({ ...options, includeCfscript: false });
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  return Object.freeze({
    version: "mixed-structural-scanner/v0.1",
    parse(text, context) {
      const extension = extensionFor(context.file);
      const isCfml = extension === ".cfm" || extension === ".cfml" || extension === ".cfc";
      const cfml = isCfml ? cfmlBackend.parse(text, context) : { nodes: [], diagnostics: [], complete: true };
      if (cfml.tree?.kind === "CFML_SCRIPT_DOCUMENT") {
        return {
          tree: { kind: "MIXED_STRUCTURAL_DOCUMENT", backend: "mixed-structural-scanner/v0.1", nodes: cfml.tree.nodes },
          complete: cfml.complete === true,
          diagnostics: cfml.diagnostics,
        };
      }
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
