import { SourceIndex } from "./source-index.js";
import { ToolFailure } from "../schema/errors.js";
import type { Finding, SourceLocation } from "../schema/types.js";

export const PAIRED_TAGS = new Set([
  "cfif",
  "cfloop",
  "cfoutput",
  "cfquery",
  "cfsavecontent",
  "cfsilent",
  "cfcomponent",
  "cffunction",
  "cfscript",
]);
export const BRANCH_TAGS = new Set(["cfelseif", "cfelse"]);
export const BODYLESS_TAGS = new Set(["cfset", "cfreturn", "cfinclude", "cfargument", "cfqueryparam"]);

type TagKind = "open" | "close" | "branch" | "bodyless" | "unknown";

interface TagToken {
  kind: TagKind;
  name: string;
  start: number;
  end: number;
  self_closing: boolean;
}

interface ScriptRegion {
  content_start: number;
  content_end: number;
}

interface ScanResult {
  findings: Finding[];
  incomplete: Array<{ code: string; message: string }>;
  script_regions: ScriptRegion[];
  saw_cfml_tag: boolean;
}

interface ScanContext {
  source: string;
  index: SourceIndex;
  deadline: number;
  max_nesting: number;
  max_findings: number;
}

interface OpenTag {
  name: string;
  start: number;
  end: number;
  branch_else_seen: boolean;
}

function isNameCharacter(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_:-]/u.test(character);
}

function startsCfTag(source: string, index: number): boolean {
  const afterSlash = source[index + 1] === "/" ? index + 2 : index + 1;
  return source.slice(afterSlash, afterSlash + 2).toLowerCase() === "cf" && isNameCharacter(source[afterSlash + 2]);
}

function consumeCfmlComment(source: string, start: number): number | null {
  let depth = 1;
  let cursor = start + 5;
  while (cursor < source.length) {
    if (source.startsWith("<!---", cursor)) {
      depth += 1;
      cursor += 5;
      continue;
    }
    if (source.startsWith("--->", cursor)) {
      depth -= 1;
      cursor += 4;
      if (depth === 0) return cursor;
      continue;
    }
    cursor += 1;
  }
  return null;
}

function parseTag(source: string, start: number): { token: TagToken; next: number } | { error: string; at: number } {
  const closing = source[start + 1] === "/";
  let cursor = closing ? start + 2 : start + 1;
  const nameStart = cursor;
  while (isNameCharacter(source[cursor])) cursor += 1;
  const name = source.slice(nameStart, cursor).toLowerCase();
  if (!name.startsWith("cf")) return { error: "NOT_CF_TAG", at: start };

  let quote: string | null = null;
  while (cursor < source.length) {
    const character = source[cursor];
    if (quote !== null) {
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === quote) {
        if (source[cursor + 1] === quote) {
          cursor += 2;
          continue;
        }
        quote = null;
      }
      cursor += 1;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (source.startsWith("<!---", cursor)) {
      const commentEnd = consumeCfmlComment(source, cursor);
      if (commentEnd === null) return { error: "UNTERMINATED_COMMENT", at: cursor };
      cursor = commentEnd;
      continue;
    }
    if (character === ">") {
      let beforeEnd = cursor - 1;
      while (beforeEnd >= start && /\s/u.test(source[beforeEnd] ?? "")) beforeEnd -= 1;
      const selfClosing = source[beforeEnd] === "/";
      const kind: TagKind = closing
        ? "close"
        : BRANCH_TAGS.has(name)
          ? "branch"
          : BODYLESS_TAGS.has(name)
            ? "bodyless"
            : PAIRED_TAGS.has(name)
              ? "open"
              : "unknown";
      return { token: { kind, name, start, end: cursor + 1, self_closing: selfClosing }, next: cursor + 1 };
    }
    cursor += 1;
  }
  if (quote !== null) return { error: "UNTERMINATED_STRING", at: cursor };
  return { error: "UNTERMINATED_TAG", at: start };
}

function addFinding(context: ScanContext, findings: Finding[], finding: Finding): void {
  if (findings.length >= context.max_findings) {
    throw new ToolFailure("LIMIT_EXCEEDED", "The findings limit was reached; no partial success is returned", 3);
  }
  findings.push(finding);
}

function related(index: SourceIndex, tag: OpenTag | undefined): SourceLocation | null {
  return tag === undefined ? null : index.location(tag.start, tag.end);
}

function finding(
  context: ScanContext,
  code: Finding["code"],
  message: string,
  start: number,
  end: number,
  open?: OpenTag,
): Finding {
  return { code, message, location: context.index.location(start, end), related_open: related(context.index, open) };
}

function checkDeadline(context: ScanContext, cursor: number): void {
  if ((cursor & 255) === 0 && Date.now() > context.deadline) {
    throw new ToolFailure("LIMIT_EXCEEDED", "The processing time limit was reached; no partial success is returned", 3);
  }
}

function scanScriptDelimiters(context: ScanContext, start: number, end: number, findings: Finding[]): void {
  const stack: Array<{ character: string; start: number }> = [];
  let quote: string | null = null;
  let blockCommentStart: number | null = null;
  let cursor = start;
  while (cursor < end) {
    checkDeadline(context, cursor);
    const character = context.source[cursor];
    if (quote !== null) {
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === quote) {
        if (context.source[cursor + 1] === quote) {
          cursor += 2;
          continue;
        }
        quote = null;
      }
      cursor += 1;
      continue;
    }
    if (blockCommentStart !== null) {
      if (context.source.startsWith("*/", cursor)) {
        blockCommentStart = null;
        cursor += 2;
      } else cursor += 1;
      continue;
    }
    if (context.source.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < end && context.source[cursor] !== "\n" && context.source[cursor] !== "\r") cursor += 1;
      continue;
    }
    if (context.source.startsWith("/*", cursor)) {
      blockCommentStart = cursor;
      cursor += 2;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (character === "(" || character === "[" || character === "{") {
      if (stack.length >= context.max_nesting) {
        throw new ToolFailure("LIMIT_EXCEEDED", "The nesting limit was reached; no partial success is returned", 3);
      }
      stack.push({ character, start: cursor });
      cursor += 1;
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      const expected = character === ")" ? "(" : character === "]" ? "[" : "{";
      const open = stack[stack.length - 1];
      if (open?.character !== expected) {
        addFinding(
          context,
          findings,
          finding(context, "UNBALANCED_DELIMITER", `Unmatched CFScript delimiter "${character}"`, cursor, cursor + 1),
        );
      } else {
        stack.pop();
      }
    }
    cursor += 1;
  }
  if (quote !== null) {
    addFinding(context, findings, finding(context, "UNTERMINATED_STRING", "Unterminated CFScript string", end, end));
  }
  if (blockCommentStart !== null) {
    addFinding(context, findings, finding(context, "UNTERMINATED_COMMENT", "Unterminated CFScript block comment", blockCommentStart, end));
  }
  for (const open of stack) {
    addFinding(
      context,
      findings,
      finding(context, "UNBALANCED_DELIMITER", `Unclosed CFScript delimiter "${open.character}"`, open.start, open.start + 1),
    );
  }
}

function scanScriptRegion(context: ScanContext, start: number): { close: TagToken | null; content_end: number; incomplete?: { code: string; message: string } } {
  let quote: string | null = null;
  let blockCommentStart: number | null = null;
  let cursor = start;
  while (cursor < context.source.length) {
    checkDeadline(context, cursor);
    const character = context.source[cursor];
    if (quote !== null) {
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if (character === quote) {
        if (context.source[cursor + 1] === quote) cursor += 2;
        else {
          quote = null;
          cursor += 1;
        }
        continue;
      }
      cursor += 1;
      continue;
    }
    if (blockCommentStart !== null) {
      if (context.source.startsWith("*/", cursor)) {
        blockCommentStart = null;
        cursor += 2;
      } else cursor += 1;
      continue;
    }
    if (context.source.startsWith("//", cursor)) {
      cursor += 2;
      while (cursor < context.source.length && context.source[cursor] !== "\n" && context.source[cursor] !== "\r") cursor += 1;
      continue;
    }
    if (context.source.startsWith("/*", cursor)) {
      blockCommentStart = cursor;
      cursor += 2;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    if (startsCfTag(context.source, cursor)) {
      const parsed = parseTag(context.source, cursor);
      if ("error" in parsed) return { close: null, content_end: cursor, incomplete: { code: parsed.error, message: `CFScript region cannot be parsed (${parsed.error})` } };
      if (parsed.token.name === "cfscript" && parsed.token.kind === "close") {
        return { close: parsed.token, content_end: cursor };
      }
      return { close: null, content_end: cursor, incomplete: { code: "UNSUPPORTED_SYNTAX", message: "CFML tag island inside cfscript is outside the supported profile" } };
    }
    cursor += 1;
  }
  if (quote !== null) return { close: null, content_end: context.source.length, incomplete: { code: "UNTERMINATED_STRING", message: "Unterminated CFScript string" } };
  if (blockCommentStart !== null) return { close: null, content_end: context.source.length, incomplete: { code: "UNTERMINATED_COMMENT", message: "Unterminated CFScript block comment" } };
  return { close: null, content_end: context.source.length, incomplete: { code: "UNTERMINATED_TAG", message: "cfscript has no closing tag" } };
}

function processTag(
  context: ScanContext,
  token: TagToken,
  stack: OpenTag[],
  findings: Finding[],
): void {
  if (token.kind === "unknown") {
    throw new ToolFailure("UNSUPPORTED_SYNTAX", `Unsupported CFML tag "${token.name}"`, 3);
  }
  if (token.kind === "bodyless") {
    return;
  }
  if (token.kind === "branch") {
    const current = stack[stack.length - 1];
    if (current?.name !== "cfif") {
      addFinding(context, findings, finding(context, "INVALID_BRANCH", `${token.name} must belong to the directly open cfif`, token.start, token.end));
      return;
    }
    if (token.name === "cfelse") {
      if (current.branch_else_seen) {
        addFinding(context, findings, finding(context, "INVALID_BRANCH", "cfif cannot contain more than one cfelse", token.start, token.end, current));
      }
      current.branch_else_seen = true;
    } else if (current.branch_else_seen) {
      addFinding(context, findings, finding(context, "INVALID_BRANCH", "cfelseif cannot appear after cfelse", token.start, token.end, current));
    }
    return;
  }
  if (token.kind === "open") {
    if (token.self_closing) throw new ToolFailure("UNSUPPORTED_SYNTAX", `Paired tag "${token.name}" cannot be self-closing`, 3);
    if (stack.length >= context.max_nesting) throw new ToolFailure("LIMIT_EXCEEDED", "The tag nesting limit was reached; no partial success is returned", 3);
    stack.push({ name: token.name, start: token.start, end: token.end, branch_else_seen: false });
    return;
  }
  if (token.name === "cfscript" && stack[stack.length - 1]?.name !== "cfscript") {
    addFinding(context, findings, finding(context, "UNEXPECTED_CLOSE", "Closing cfscript has no directly open cfscript", token.start, token.end));
    return;
  }
  if (BODYLESS_TAGS.has(token.name)) {
    throw new ToolFailure("UNSUPPORTED_SYNTAX", `Bodyless tag "${token.name}" cannot have a closing tag`, 3);
  }
  const current = stack[stack.length - 1];
  if (current === undefined) {
    addFinding(context, findings, finding(context, "UNEXPECTED_CLOSE", `Unexpected closing tag "${token.name}"`, token.start, token.end));
    return;
  }
  if (current.name !== token.name) {
    addFinding(context, findings, finding(context, "MISMATCHED_CLOSE", `Closing tag "${token.name}" does not match open "${current.name}"`, token.start, token.end, current));
    return;
  }
  stack.pop();
}

export function scanCfml(source: string, limits: { max_nesting: number; max_findings: number; time_limit_ms: number }): ScanResult {
  const index = new SourceIndex(source);
  const context: ScanContext = { source, index, deadline: Date.now() + limits.time_limit_ms, max_nesting: limits.max_nesting, max_findings: limits.max_findings };
  const findings: Finding[] = [];
  const incomplete: Array<{ code: string; message: string }> = [];
  const script_regions: ScriptRegion[] = [];
  const stack: OpenTag[] = [];
  let saw_cfml_tag = false;
  let cursor = 0;
  while (cursor < source.length) {
    checkDeadline(context, cursor);
    if (source.startsWith("<!---", cursor)) {
      const end = consumeCfmlComment(source, cursor);
      if (end === null) {
        incomplete.push({ code: "UNTERMINATED_COMMENT", message: `Unterminated CFML comment at line ${index.position(cursor).line}, column ${index.position(cursor).column}` });
        break;
      }
      cursor = end;
      continue;
    }
    if (source[cursor] !== "<" || !startsCfTag(source, cursor)) {
      cursor += 1;
      continue;
    }
    saw_cfml_tag = true;
    const parsed = parseTag(source, cursor);
    if ("error" in parsed) {
      incomplete.push({ code: parsed.error, message: `CFML tag cannot be parsed (${parsed.error}) at line ${index.position(parsed.at).line}, column ${index.position(parsed.at).column}` });
      break;
    }
    const token = parsed.token;
    if (token.kind === "open" && token.name === "cfscript") {
      processTag(context, token, stack, findings);
      const script = scanScriptRegion(context, token.end);
      scanScriptDelimiters(context, token.end, script.content_end, findings);
      script_regions.push({ content_start: token.end, content_end: script.content_end });
      if (script.incomplete !== undefined) {
        incomplete.push({ code: script.incomplete.code, message: `${script.incomplete.message} at line ${index.position(script.content_end).line}, column ${index.position(script.content_end).column}` });
        break;
      }
      if (script.close !== null) {
        processTag(context, script.close, stack, findings);
        cursor = script.close.end;
        continue;
      }
    }
    processTag(context, token, stack, findings);
    cursor = parsed.next;
  }
  for (const open of stack.reverse()) {
    addFinding(context, findings, finding(context, "UNCLOSED_TAG", `Unclosed CFML tag "${open.name}"`, open.start, open.end, open));
  }
  findings.sort((left, right) => left.location.start_byte - right.location.start_byte || left.code.localeCompare(right.code));
  return { findings, incomplete, script_regions, saw_cfml_tag };
}

export function checkPureScriptCfc(source: string, extension: string, limits: { max_nesting: number; max_findings: number; time_limit_ms: number }): ScanResult {
  const leading = source.replace(/^\uFEFF/u, "").trimStart();
  const pureScript = extension.toLowerCase() === ".cfc" && /^(?:component|interface)\b/iu.test(leading);
  if (pureScript) {
    const result: ScanResult = { findings: [], incomplete: [], script_regions: [], saw_cfml_tag: false };
    const index = new SourceIndex(source);
    const context: ScanContext = { source, index, deadline: Date.now() + limits.time_limit_ms, max_nesting: limits.max_nesting, max_findings: limits.max_findings };
    scanScriptDelimiters(context, 0, source.length, result.findings);
    result.findings.sort((left, right) => left.location.start_byte - right.location.start_byte || left.code.localeCompare(right.code));
    return result;
  }
  const result = scanCfml(source, limits);
  if (extension.toLowerCase() !== ".cfc" || result.saw_cfml_tag) return result;
  if (!pureScript) {
    result.incomplete.push({ code: "UNSUPPORTED_SYNTAX", message: "The .cfc source does not use a recognized pure-script component entry mode" });
  }
  return result;
}
