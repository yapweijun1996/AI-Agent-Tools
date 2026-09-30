import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const TREE_SITTER_VERSION = "tree-sitter-cfml/0.26.2";
const DEFAULT_MAX_NODES = 100_000;
const DEFAULT_MAX_ATTRIBUTE_BYTES = 4_096;
const MAX_DIAGNOSTIC_MESSAGE = 2_048;

const SPECIAL_TAG_TYPES = new Map([
  ["cf_else_tag", "cfelse"],
  ["cf_elseif_tag", "cfelseif"],
  ["cf_if_tag", "cfif"],
  ["cf_output_tag", "cfoutput"],
  ["cf_query_tag", "cfquery"],
  ["cf_return_tag", "cfreturn"],
  ["cf_script_tag", "cfscript"],
  ["cf_set_tag", "cfset"],
]);
const OPAQUE_NODE_TYPES = new Set(["cf_query_content", "cf_script_content"]);
const SCRIPT_ROOT_TYPES = new Set(["component"]);
const CFML_EXTENSIONS = new Set([".cfm", ".cfml", ".cfc", ".cfs"]);
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

function normalizePositiveLimit(value, name, fallback) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  return result;
}

function loadDependencies() {
  try {
    return {
      Parser: require("tree-sitter").Parser,
      grammars: require("@cfmleditor/tree-sitter-cfml"),
    };
  } catch (error) {
    const unavailable = new Error("Tree-sitter CFML dependencies are unavailable in this runtime.", { cause: error });
    unavailable.code = "PARSER_UNAVAILABLE";
    throw unavailable;
  }
}

function nodeText(node) {
  return typeof node?.text === "string" ? node.text : "";
}

function namedChildren(node) {
  return Array.isArray(node?.namedChildren) ? node.namedChildren : [];
}

function childOfType(node, type) {
  return namedChildren(node).find((child) => child?.type === type) ?? null;
}

function textForChild(node, types) {
  const child = namedChildren(node).find((item) => types.has(item?.type));
  return child ? { node: child, text: nodeText(child) } : null;
}

function boundedValue(value, maxBytes) {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return { value, truncated: false };
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), "utf8") > maxBytes) end -= 1;
  return { value: value.slice(0, end), truncated: true };
}

function spanFromNode(node, sourceMap) {
  if (!Number.isSafeInteger(node?.startIndex) || !Number.isSafeInteger(node?.endIndex)) return undefined;
  try {
    return sourceMap.spanFromByteOffsets(node.startIndex, node.endIndex);
  } catch {
    return undefined;
  }
}

function spanFromByteOffsets(sourceMap, start, end) {
  try {
    return sourceMap.spanFromByteOffsets(start, end);
  } catch {
    return undefined;
  }
}

function boundedSpan(sourceMap, node, maxBytes) {
  const text = nodeText(node);
  const bounded = boundedValue(text, maxBytes);
  const end = node.startIndex + Buffer.byteLength(bounded.value, "utf8");
  return { ...bounded, span: spanFromByteOffsets(sourceMap, node.startIndex, end) };
}

function diagnostic(code, severity, message, sourceMap, node) {
  return {
    code,
    severity,
    message: message.slice(0, MAX_DIAGNOSTIC_MESSAGE),
    ...(spanFromNode(node, sourceMap) ? { span: spanFromNode(node, sourceMap) } : {}),
  };
}

function openingTagEnd(text) {
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === quote) quote = null;
    } else if (character === "\"" || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index + 1;
    }
  }
  return text.length;
}

function openingSpan(node, sourceMap) {
  const text = nodeText(node);
  const end = node.startIndex + Buffer.byteLength(text.slice(0, openingTagEnd(text)), "utf8");
  return spanFromByteOffsets(sourceMap, node.startIndex, Math.min(end, node.endIndex));
}

function tagNameFromText(text) {
  let cursor = text.indexOf("<") + 1;
  if (cursor <= 0) return null;
  if (text[cursor] === "/") cursor += 1;
  const start = cursor;
  while (cursor < text.length) {
    const code = text.charCodeAt(cursor);
    const valid = (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || text[cursor] === "_" || text[cursor] === ":" || text[cursor] === "-";
    if (!valid) break;
    cursor += 1;
  }
  return cursor === start ? null : text.slice(start, cursor).toLowerCase();
}

function stripQuotedValue(value) {
  if (value.length < 2) return { value, quote: null };
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === "\"" || first === "'") && last === first) return { value: value.slice(1, -1), quote: first };
  return { value, quote: null };
}

function attributeNodes(node) {
  const container = childOfType(node, "tag_attributes");
  const candidates = container ? namedChildren(container) : namedChildren(node);
  return candidates.filter((child) => child?.type === "cf_attribute");
}

function convertAttribute(node, sourceMap, maxAttributeBytes) {
  const nameNode = childOfType(node, "cf_attribute_name");
  const valueNode = namedChildren(node).find((child) => ["cf_attribute_value", "quoted_cf_attribute_value"].includes(child?.type));
  const name = nodeText(nameNode).trim().toLowerCase();
  if (name === "") return null;
  const rawValue = valueNode ? nodeText(valueNode) : null;
  const stripped = rawValue === null ? { value: null, quote: null } : stripQuotedValue(rawValue);
  const bounded = stripped.value === null ? { value: null, truncated: false } : boundedValue(stripped.value, maxAttributeBytes);
  return {
    name,
    value: bounded.value,
    ...(stripped.quote ? { quote: stripped.quote } : {}),
    ...(bounded.truncated ? { truncated: true } : {}),
    ...(spanFromNode(node, sourceMap) ? { span: spanFromNode(node, sourceMap) } : {}),
  };
}

function convertAttributes(node, sourceMap, maxAttributeBytes) {
  return attributeNodes(node)
    .map((item) => convertAttribute(item, sourceMap, maxAttributeBytes))
    .filter(Boolean);
}

function expressionFor(node, sourceMap, maxAttributeBytes) {
  const expression = textForChild(node, new Set(["expression", "hash_expression", "hash_empty"]));
  if (!expression) return null;
  const bounded = boundedSpan(sourceMap, expression.node, maxAttributeBytes);
  return {
    expression: bounded.value.trim(),
    expression_span: bounded.span,
    expression_truncated: bounded.truncated,
  };
}

function tagNode(node, name, sourceMap, maxAttributeBytes, { closing = false, selfClosing = false, opening = false } = {}) {
  const span = opening ? openingSpan(node, sourceMap) : spanFromNode(node, sourceMap);
  const byteEnd = opening && span ? sourceMap.positionToByteOffset(span.end_line, span.end_col) : node.endIndex;
  return {
    kind: "CFML_TAG",
    name,
    closing,
    self_closing: selfClosing,
    supported: !name.startsWith("cf") || SUPPORTED_CFML_TAGS.has(name),
    attributes: closing ? [] : convertAttributes(node, sourceMap, maxAttributeBytes),
    ...(closing || !SPECIAL_TAG_TYPES.has(node.type) ? {} : expressionFor(node, sourceMap, maxAttributeBytes) ?? {}),
    ...(span ? { span } : {}),
    byte_start: node.startIndex,
    byte_end: byteEnd,
  };
}

function convertTag(node, sourceMap, maxAttributeBytes) {
  const specialName = SPECIAL_TAG_TYPES.get(node?.type);
  if (specialName) return tagNode(node, specialName, sourceMap, maxAttributeBytes, { opening: true });
  if (node?.type === "cf_end_tag" || node?.type === "erroneous_cf_end_tag") {
    return tagNode(node, tagNameFromText(nodeText(node)) ?? "cfunknown", sourceMap, maxAttributeBytes, { closing: true });
  }
  if (node?.type === "cf_start_tag" || node?.type === "cf_start_tag_with_selfclose") {
    const name = nodeText(childOfType(node, "cf_tag_name")) || tagNameFromText(nodeText(node));
    if (!name) return null;
    return tagNode(node, name.toLowerCase(), sourceMap, maxAttributeBytes, { selfClosing: node.type === "cf_start_tag_with_selfclose" });
  }
  if (node?.type === "cf_selfclose_tag") {
    const name = tagNameFromText(nodeText(node));
    return name ? tagNode(node, name, sourceMap, maxAttributeBytes, { selfClosing: true }) : null;
  }
  return null;
}

function opaqueNode(node, sourceMap) {
  const span = spanFromNode(node, sourceMap);
  return {
    kind: "OPAQUE_REGION",
    name: node.type,
    parsed: true,
    ...(span ? { span } : {}),
    byte_start: node.startIndex,
    byte_end: node.endIndex,
  };
}

function languageNameForFile(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === ".cfc") return "cfml";
  if (extension === ".cfs") return "cfscript";
  if (CFML_EXTENSIONS.has(extension)) return "cfhtml";
  return null;
}

function languageFor(grammarSet, name) {
  const grammar = grammarSet?.[name];
  if (!grammar) throw new Error(`Tree-sitter CFML grammar is unavailable: ${name}.`);
  return grammar.language ?? grammar;
}

function parserConstructor(value) {
  if (typeof value === "function") return value;
  if (typeof value?.Parser === "function") return value.Parser;
  throw new TypeError("Parser must be a Tree-sitter Parser constructor");
}

/**
 * Create an explicit Tree-sitter CFML backend using
 * @cfmleditor/tree-sitter-cfml@0.26.2 and tree-sitter@0.25.0.
 *
 * The backend normalizes syntax tags into the existing bounded structural tree.
 * Script and embedded-language regions remain explicit opaque evidence until
 * their Fact IR adapters are implemented; no dynamic code is executed.
 */
export function createTreeSitterCfmlBackend({ Parser = null, grammars = null, maxNodes = DEFAULT_MAX_NODES, maxAttributeBytes = DEFAULT_MAX_ATTRIBUTE_BYTES } = {}) {
  const dependencies = Parser === null || grammars === null ? loadDependencies() : { Parser, grammars };
  const Constructor = parserConstructor(dependencies.Parser);
  if (!dependencies.grammars || typeof dependencies.grammars !== "object") throw new TypeError("grammars must be a Tree-sitter CFML grammar set");
  const normalizedMaxNodes = normalizePositiveLimit(maxNodes, "maxNodes", DEFAULT_MAX_NODES);
  const normalizedMaxAttributeBytes = normalizePositiveLimit(maxAttributeBytes, "maxAttributeBytes", DEFAULT_MAX_ATTRIBUTE_BYTES);

  return Object.freeze({
    version: TREE_SITTER_VERSION,
    parse(text, { file, sourceMap }) {
      const grammarName = languageNameForFile(file);
      if (grammarName === null) {
        return {
          tree: { kind: "CFML_TREE_SITTER_DOCUMENT", backend: TREE_SITTER_VERSION, nodes: [] },
          complete: false,
          diagnostics: [{ code: "UNSUPPORTED_LANGUAGE", severity: "warning", message: "Tree-sitter CFML backend accepts only CFML source files." }],
        };
      }

      const parser = new Constructor();
      parser.setLanguage(languageFor(dependencies.grammars, grammarName));
      const parsedTree = parser.parse(text);
      if (!parsedTree || !parsedTree.rootNode) throw new Error("Tree-sitter returned no syntax tree.");

      const nodes = [];
      const diagnostics = [];
      const seenTags = new Set();
      const seenOpaque = new Set();
      let complete = parsedTree.rootNode.hasError !== true;
      let limited = false;

      function addNode(node) {
        if (nodes.length >= normalizedMaxNodes) {
          if (!limited) {
            diagnostics.push({ code: "RESOURCE_LIMIT", severity: "error", message: `Parser node limit exceeded: ${normalizedMaxNodes}.`, span: spanFromNode(node, sourceMap) });
            limited = true;
          }
          complete = false;
          return false;
        }
        nodes.push(node);
        return true;
      }

      function visit(node) {
        if (limited || !node) return;
        if (node.isError === true || node.isMissing === true) {
          diagnostics.push(diagnostic(node.isMissing === true ? "PARSER_MISSING" : "PARSER_ERROR", "error", node.isMissing === true ? "Tree-sitter inserted a missing syntax node." : "Tree-sitter reported a syntax error.", sourceMap, node));
          complete = false;
        }

        const converted = convertTag(node, sourceMap, normalizedMaxAttributeBytes);
        if (converted) {
          const key = [converted.byte_start, converted.byte_end, converted.name, converted.closing ? "close" : "open"].join("\0");
          if (!seenTags.has(key)) {
            seenTags.add(key);
            addNode(converted);
            if (!converted.supported) {
              diagnostics.push({
                code: "UNSUPPORTED_SYNTAX",
                severity: "warning",
                message: `CFML tag is outside the supported Fact subset: ${converted.name}.`,
                ...(spanFromNode(node, sourceMap) ? { span: spanFromNode(node, sourceMap) } : {}),
              });
              complete = false;
            }
          }
        }

        const isOpaque = OPAQUE_NODE_TYPES.has(node.type) || node.type === "script_element" || node.type === "style_element" || SCRIPT_ROOT_TYPES.has(node.type);
        if (isOpaque) {
          const key = [node.startIndex, node.endIndex, node.type].join("\0");
          if (!seenOpaque.has(key)) {
            seenOpaque.add(key);
            addNode(opaqueNode(node, sourceMap));
            diagnostics.push({
              code: "UNSUPPORTED_SYNTAX",
              severity: "warning",
              message: "Parsed script or embedded-language syntax is preserved as opaque evidence until its Fact IR adapter is selected.",
              ...(spanFromNode(node, sourceMap) ? { span: spanFromNode(node, sourceMap) } : {}),
            });
            complete = false;
          }
        }

        for (const child of namedChildren(node)) visit(child);
      }

      if (grammarName === "cfscript") {
        addNode(opaqueNode(parsedTree.rootNode, sourceMap));
        diagnostics.push({
          code: "UNSUPPORTED_SYNTAX",
          severity: "warning",
          message: "Pure CFScript is parsed but preserved as opaque evidence until its Fact IR adapter is selected.",
          ...(spanFromNode(parsedTree.rootNode, sourceMap) ? { span: spanFromNode(parsedTree.rootNode, sourceMap) } : {}),
        });
        complete = false;
      } else {
        visit(parsedTree.rootNode);
      }
      nodes.sort((left, right) => left.byte_start - right.byte_start || left.byte_end - right.byte_end || left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
      if (diagnostics.length > 0) complete = false;
      return {
        tree: { kind: "CFML_TREE_SITTER_DOCUMENT", backend: TREE_SITTER_VERSION, grammar: grammarName, nodes },
        complete,
        diagnostics,
      };
    },
  });
}

export const TREE_SITTER_CFML_PARSER_VERSION = TREE_SITTER_VERSION;
