import crypto from "node:crypto";
import path from "node:path";

const TOOL_NAME = "agent-cfml-linkage";
const DEFAULT_TOOL_VERSION = "0.1.0";
const FACT_SCHEMA_VERSION = "agent-cfml-linkage-fact/v0.1";
const MAX_DIAGNOSTIC_MESSAGE = 2048;
const MAX_FACTS = 500_000;
const APPLICATION_HOOK_NAMES = new Set(["onApplicationEnd", "onApplicationStart", "onCFCRequest", "onError", "onMissingTemplate", "onRequest", "onRequestStart", "onSessionEnd", "onSessionStart"].map((name) => name.toLowerCase()));
const CONDITION_BRANCH_KINDS = Object.freeze({ cfif: "if", cfelseif: "if", cfelse: "if", cfswitch: "switch", cfcase: "case", cfdefaultcase: "case" });
const CONTROL_FLOW_TAGS = new Set(["cfbreak", "cfcatch", "cfcontinue", "cfloop", "cfreturn", "cfthrow", "cftry"]);

function isWhitespace(character) {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return code === 9 || code === 10 || code === 11 || code === 12 || code === 13 || code === 32;
}

function normalizeText(value) {
  if (typeof value !== "string") return "";
  let output = "";
  let pendingSpace = false;
  for (const character of value.trim()) {
    if (isWhitespace(character)) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace) output += " ";
    output += character;
    pendingSpace = false;
  }
  return output;
}

function languageForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".cfm" || extension === ".cfml" || extension === ".cfc") return "cfml";
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".js" || extension === ".mjs") return "javascript";
  if (extension === ".css") return "css";
  if (extension === ".sql") return "sql";
  return "unknown";
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareFacts(left, right) {
  const leftSpan = left.span ?? {};
  const rightSpan = right.span ?? {};
  return compareStrings([
    left.file ?? "",
    leftSpan.start_line ?? 0,
    leftSpan.start_col ?? 0,
    leftSpan.end_line ?? 0,
    leftSpan.end_col ?? 0,
    left.kind ?? "",
    left.fact_id ?? "",
  ].join("\0"), [
    right.file ?? "",
    rightSpan.start_line ?? 0,
    rightSpan.start_col ?? 0,
    rightSpan.end_line ?? 0,
    rightSpan.end_col ?? 0,
    right.kind ?? "",
    right.fact_id ?? "",
  ].join("\0"));
}

function stableFactId(file, kind, node, rule, ordinal) {
  const span = node.span ?? { start_line: 1, start_col: 0, end_line: 1, end_col: 0 };
  const identity = [
    "v0.1",
    "fact",
    file,
    kind,
    rule,
    span.start_line,
    span.start_col,
    span.end_line,
    span.end_col,
    ordinal,
  ].join("\0");
  return `fact:${sha256(identity).slice("sha256:".length)}`;
}

function attribute(node, name) {
  return node.attributes?.find((item) => item.name === name) ?? null;
}

function literalAttribute(node, name) {
  const item = attribute(node, name);
  if (!item || typeof item.value !== "string" || item.value.trim() === "" || item.truncated === true || item.value.includes("#")) return null;
  return normalizeText(item.value);
}

function dynamicValue(node, names) {
  return names.some((name) => {
    const item = attribute(node, name);
    return item && (item.value === null || item.truncated === true || (typeof item.value === "string" && item.value.includes("#")));
  });
}

function splitList(value) {
  if (typeof value !== "string") return [];
  const values = [];
  let current = "";
  for (const character of value) {
    if (character === ",") {
      const normalized = normalizeText(current);
      if (normalized !== "") values.push(normalized);
      current = "";
    } else {
      current += character;
    }
  }
  const normalized = normalizeText(current);
  if (normalized !== "") values.push(normalized);
  return [...new Set(values)].sort();
}

function assignmentTarget(expression) {
  if (typeof expression !== "string") return null;
  const equals = expression.indexOf("=");
  if (equals <= 0) return null;
  const target = normalizeText(expression.slice(0, equals));
  if (target === "" || target.includes("#") || target.includes(" ") || /[\[\]()]/u.test(target)) return null;
  return target;
}

function identifierCharacter(character) {
  if (character === undefined) return false;
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === "_" || character === "$" || character === ".";
}

function scopeReferences(expression, excluded = null) {
  if (typeof expression !== "string") return [];
  const references = new Set();
  let cursor = 0;
  let quote = null;
  while (cursor < expression.length) {
    const character = expression[cursor];
    if (quote !== null) {
      if (character === "\\") cursor += 2;
      else {
        if (character === quote) quote = null;
        cursor += 1;
      }
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      cursor += 1;
      continue;
    }
    const code = character?.charCodeAt(0) ?? 0;
    const startsIdentifier = (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || character === "_" || character === "$";
    if (!startsIdentifier) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    cursor += 1;
    while (cursor < expression.length && identifierCharacter(expression[cursor])) cursor += 1;
    const reference = expression.slice(start, cursor).replace(/\.+$/u, "");
    if (reference !== "" && reference !== excluded && !["true", "false", "null", "yes", "no", "and", "or", "not", "eq", "neq", "lt", "lte", "gt", "gte", "is", "contains", "mod"].includes(reference.toLowerCase())) references.add(reference);
  }
  return [...references].sort();
}

function conditionFor(node, previousCondition = null) {
  const branchKind = CONDITION_BRANCH_KINDS[node.name];
  if (!branchKind) return null;
  if (node.name === "cfelse") {
    const previousExpression = previousCondition?.expression_normalized;
    return {
      expression_normalized: (previousExpression ? `else branch for ${previousExpression}` : "else branch").slice(0, 2048),
      source_span: node.span,
      variables: previousCondition?.variables ?? [],
      branch_kind: branchKind,
      evaluation: "runtime",
    };
  }
  const expressionAttribute = attribute(node, "expression")?.value;
  const caseAttribute = attribute(node, "value")?.value;
  const rawExpression = node.name === "cfdefaultcase" ? "default case" : node.expression ?? expressionAttribute ?? caseAttribute;
  const expression = normalizeText(rawExpression);
  if (expression === "") return null;
  return {
    expression_normalized: expression.slice(0, 2048),
    source_span: node.span,
    variables: node.name === "cfdefaultcase" ? [] : scopeReferences(expression),
    branch_kind: branchKind,
    evaluation: "runtime",
  };
}

function combineSwitchCase(switchCondition, caseCondition, isDefaultCase = false) {
  if (!caseCondition) return null;
  if (!switchCondition) return caseCondition;
  return {
    expression_normalized: (isDefaultCase ? `default case for ${switchCondition.expression_normalized}` : `${switchCondition.expression_normalized} == ${caseCondition.expression_normalized}`).slice(0, 2048),
    source_span: caseCondition.source_span,
    variables: [...new Set([...(switchCondition.variables ?? []), ...(caseCondition.variables ?? [])])].sort(),
    branch_kind: "case",
    evaluation: "runtime",
  };
}

function makeFact({ file, language, node, kind, normalizedExpression, enclosingSymbol = null, condition = null, extractionRuleId, attributes: values, ordinal }) {
  return {
    fact_id: stableFactId(file, kind, node, extractionRuleId, ordinal),
    kind,
    file,
    language,
    span: node.span,
    normalized_expression: normalizeText(normalizedExpression).slice(0, 4096) || `${kind.toLowerCase()} ${file}`,
    enclosing_symbol: enclosingSymbol,
    condition,
    extraction_rule_id: extractionRuleId,
    attributes: values ?? {},
  };
}

function makeDynamicFact({ file, language, node, sourceKind, expression, enclosingSymbol, condition = null, unresolvedReason = "DYNAMIC_EXPRESSION", ordinal }) {
  return makeFact({
    file,
    language,
    node,
    kind: "DYNAMIC_REFERENCE",
    normalizedExpression: normalizeText(expression) || `${sourceKind.toLowerCase()} dynamic reference`,
    enclosingSymbol,
    condition,
    extractionRuleId: `dynamic-${sourceKind.toLowerCase()}-v0.1`,
    attributes: { source_kind: sourceKind, dynamic: true, ...(unresolvedReason !== "DYNAMIC_EXPRESSION" ? { unresolved_reason: unresolvedReason } : {}) },
    ordinal,
  });
}

function appendRepositoryActionFacts(facts, addFact, nextOrdinal) {
  const methods = facts.filter((fact) => fact.kind === "METHOD" && path.extname(fact.file).toLowerCase() === ".cfc").sort(compareFacts);
  for (const method of methods) {
    const actionName = method.normalized_expression.replace(/^method\s+/u, "");
    const queryFacts = facts.filter((fact) => fact.kind === "QUERY" && fact.file === method.file && fact.enclosing_symbol === actionName).sort(compareFacts);
    if (queryFacts.length === 0) continue;
    addFact(makeFact({
      file: method.file,
      language: method.language,
      node: method,
      kind: "REPOSITORY_ACTION",
      normalizedExpression: `repository action ${actionName}`,
      enclosingSymbol: method.enclosing_symbol,
      extractionRuleId: "repository-action-method-query-v0.1",
      attributes: {
        action_name: actionName,
        method_fact_id: method.fact_id,
        query_fact_ids: queryFacts.map((fact) => fact.fact_id),
        structural_evidence: ["cfc_method_contains_query"],
      },
      ordinal: nextOrdinal++,
    }));
  }
  return nextOrdinal;
}

function fileSpan(parsed) {
  if (parsed?.sourceMap) {
    try {
      return parsed.sourceMap.spanFromByteOffsets(0, 0);
    } catch {
      // Fall through to the bounded unknown span.
    }
  }
  return {
    start_line: 1,
    start_col: 0,
    end_line: 1,
    end_col: 0,
  };
}

function fullSourceSpan(parsed, fileBytes) {
  try {
    return parsed?.sourceMap?.spanFromByteOffsets(0, fileBytes) ?? fileSpan(parsed);
  } catch {
    return fileSpan(parsed);
  }
}

function normalizeDiagnostic(item, file, index) {
  const code = typeof item?.code === "string" && item.code !== "" ? item.code : "PARSER_DIAGNOSTIC";
  const severity = item?.severity === "error" || item?.severity === "info" ? item.severity : "warning";
  const message = typeof item?.message === "string" && item.message !== "" ? item.message : "Parser reported an unspecified diagnostic.";
  const normalized = {
    id: `diagnostic:${sha256([file, code, severity, message, index].join("\0")).slice("sha256:".length)}`,
    severity,
    code,
    message: message.slice(0, MAX_DIAGNOSTIC_MESSAGE),
  };
  if (item?.span && Number.isSafeInteger(item.span.start_line) && Number.isSafeInteger(item.span.start_col) && Number.isSafeInteger(item.span.end_line) && Number.isSafeInteger(item.span.end_col)) {
    normalized.span = {
      start_line: item.span.start_line,
      start_col: item.span.start_col,
      end_line: item.span.end_line,
      end_col: item.span.end_col,
    };
  }
  return normalized;
}

function currentCondition(stack) {
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    if (stack[index]) return stack[index];
  }
  return null;
}

function parserSummary(parsedFiles, expectedCount, parserName, parserVersion) {
  const values = parsedFiles.filter(Boolean);
  const allComplete = values.length === expectedCount && values.length > 0 && values.every((item) => item.complete === true);
  const anyTree = values.some((item) => item.tree !== null && item.tree !== undefined);
  return {
    name: parserName,
    version: parserVersion || "unselected",
    completeness: allComplete ? "complete" : (anyTree ? "partial" : "unsupported"),
  };
}

/**
 * Extract bounded structural facts from parser-adapter results. This does not
 * resolve paths, symbols, mappings, or graph edges across files.
 */
export function extractFactBundle({ snapshot, parsedFiles, toolVersion = DEFAULT_TOOL_VERSION, parserName = "cfml-parser-adapter", maxFacts = MAX_FACTS, shouldStop = () => false } = {}) {
  if (!snapshot || !Array.isArray(snapshot.files) || snapshot.files.length === 0) {
    throw new TypeError("snapshot must contain at least one source file");
  }
  if (!Array.isArray(parsedFiles)) throw new TypeError("parsedFiles must be an array");
  if (typeof toolVersion !== "string" || toolVersion.trim() === "") throw new TypeError("toolVersion must be a non-empty string");
  if (!Number.isSafeInteger(maxFacts) || maxFacts <= 0) throw new TypeError("maxFacts must be a positive safe integer");
  if (typeof shouldStop !== "function") throw new TypeError("shouldStop must be a function");

  const files = [...snapshot.files].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const parsedByFile = new Map();
  for (const parsed of parsedFiles) {
    if (parsed?.file && !parsedByFile.has(parsed.file)) parsedByFile.set(parsed.file, parsed);
  }

  const facts = [];
  const diagnostics = [];
  let complete = snapshot.complete !== false;
  let factOrdinal = 0;
  const parserResults = [];
  let activeCondition = null;

  function addDiagnostic(item, file) {
    diagnostics.push(normalizeDiagnostic(item, file, diagnostics.length));
  }

  function addFact(fact) {
    if (facts.length >= maxFacts) {
      complete = false;
      if (!diagnostics.some((item) => item.code === "RESOURCE_LIMIT")) {
        addDiagnostic({ code: "RESOURCE_LIMIT", severity: "error", message: `Fact limit exceeded: ${maxFacts}.` }, fact.file);
      }
      return false;
    }
    facts.push(activeCondition && fact.condition === null ? { ...fact, condition: activeCondition } : fact);
    return true;
  }

  for (const sourceFile of files) {
    if (shouldStop(`facts:${sourceFile.path}`)) {
      complete = false;
      break;
    }
    const file = sourceFile.path;
    const language = languageForPath(file);
    const parsed = parsedByFile.get(file);
    activeCondition = null;
    if (!parsed) {
      complete = false;
      addDiagnostic({ code: "PARSER_RESULT_MISSING", severity: "error", message: "No parser result was supplied for the discovered source file." }, file);
    } else {
      parserResults.push(parsed);
      for (const item of parsed.diagnostics ?? []) addDiagnostic(item, file);
      if (parsed.complete !== true) complete = false;
    }

    const fileNode = {
      span: fullSourceSpan(parsed, sourceFile.bytes ?? 0),
    };
    addFact(makeFact({
      file,
      language,
      node: fileNode,
      kind: "FILE",
      normalizedExpression: `${language === "cfml" && file.toLowerCase().endsWith(".cfc") ? "cfc_component" : language === "cfml" ? "cfm_page" : "source_file"} ${file}`,
      extractionRuleId: "file-kind-v0.1",
      attributes: { file_kind: language === "cfml" && file.toLowerCase().endsWith(".cfc") ? "cfc_component" : language === "cfml" ? "cfm_page" : "source_file" },
      ordinal: factOrdinal++,
    }));

    const nodes = parsed?.tree?.nodes;
    if (!Array.isArray(nodes)) continue;
    let componentName = null;
    let methodName = null;
    const conditionStack = [];
    const switchFrames = [];
    activeCondition = null;

    for (const node of nodes) {
      if (shouldStop(`facts:${file}`)) {
        complete = false;
        break;
      }
      if (!node) continue;
      const enclosingSymbol = methodName ?? componentName;
      const nodeLanguage = node.kind === "HTML_FORM" ? "html" : node.kind === "JS_FETCH" || node.kind === "JS_AJAX" || node.kind === "JS_ASSET" ? "javascript" : node.kind === "CSS_REFERENCE" ? "css" : node.kind === "SQL_QUERY" ? "sql" : language;
      activeCondition = currentCondition(conditionStack);
      if (node.kind === "CFML_SCRIPT_INCLUDE") {
        const target = typeof node.target === "string" ? normalizeText(node.target) : "";
        if (target === "" || target.includes("#")) addFact(makeDynamicFact({ file, language, node, sourceKind: "INCLUDE", expression: node.expression || "cfscript include", enclosingSymbol, unresolvedReason: "DYNAMIC_EXPRESSION", ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "INCLUDE", normalizedExpression: target, enclosingSymbol, extractionRuleId: "cfscript-include-path-v0.1", attributes: { template: target, include_phase: "page" }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "CFML_SCRIPT_REDIRECT") {
        const url = typeof node.url === "string" ? normalizeText(node.url) : "";
        if (url === "" || url.includes("#")) addFact(makeDynamicFact({ file, language, node, sourceKind: "REDIRECT", expression: node.expression || "cfscript location", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "REDIRECT", normalizedExpression: url, enclosingSymbol, extractionRuleId: "cfscript-location-url-v0.1", attributes: { url }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "CFML_SCRIPT_INSTANTIATE") {
        const component = typeof node.component === "string" ? normalizeText(node.component) : "";
        const creationKind = ["createObject", "cfobject"].includes(node.creation_kind) ? node.creation_kind : "new";
        if (component === "" || component.includes("#")) addFact(makeDynamicFact({ file, language, node, sourceKind: "INSTANTIATE", expression: node.expression || `cfscript ${creationKind}`, enclosingSymbol, unresolvedReason: "DYNAMIC_EXPRESSION", ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "INSTANTIATE", normalizedExpression: component, enclosingSymbol, extractionRuleId: creationKind === "createObject" ? "cfscript-createobject-component-v0.1" : creationKind === "cfobject" ? "cfscript-cfobject-component-v0.1" : "cfscript-new-component-v0.1", attributes: { component, ...(creationKind !== "new" ? { creation_kind: creationKind } : {}) }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "CFML_SCRIPT_CUSTOM_TAG") {
        const target = typeof node.target === "string" ? normalizeText(node.target) : "";
        if (target === "" || target.includes("#")) addFact(makeDynamicFact({ file, language, node, sourceKind: "CUSTOM_TAG", expression: node.expression || "cfscript cfmodule", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "CUSTOM_TAG", normalizedExpression: `custom tag ${target}`, enclosingSymbol, extractionRuleId: "cfscript-cfmodule-name-v0.1", attributes: { name: target }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "CFML_SCRIPT_INVOKE") {
        const component = typeof node.component === "string" ? normalizeText(node.component) : "";
        const method = typeof node.method === "string" ? normalizeText(node.method) : "";
        const invokeKind = node.invoke_kind === "cfinvoke" ? "cfinvoke" : "invoke";
        if (component === "" || method === "" || component.includes("#") || method.includes("#")) addFact(makeDynamicFact({ file, language, node, sourceKind: "INVOKE", expression: node.expression || `cfscript ${invokeKind}`, enclosingSymbol, unresolvedReason: "DYNAMIC_EXPRESSION", ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "INVOKE", normalizedExpression: `${component}.${method}`, enclosingSymbol, extractionRuleId: invokeKind === "cfinvoke" ? "cfscript-cfinvoke-v0.1" : "cfscript-invoke-v0.1", attributes: { component, method, ...(invokeKind === "cfinvoke" ? { invoke_kind: invokeKind } : {}) }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "OPAQUE_REGION") {
        if (node.dynamic_constructs?.includes("evaluate")) addFact(makeDynamicFact({ file, language, node, sourceKind: "GENERATED_SYMBOL", expression: "evaluate(...)", enclosingSymbol, unresolvedReason: "GENERATED_SYMBOL", ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "HTML_FORM") {
        const action = typeof node.action === "string" ? node.action : "";
        const dynamic = node.action_dynamic === true || action === "";
        if (dynamic) addFact(makeDynamicFact({ file, language: nodeLanguage, node, sourceKind: "FORM", expression: (node.attributes?.find((item) => item.name === "action")?.value ?? action) || "form action", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language: nodeLanguage, node, kind: "FORM", normalizedExpression: action, enclosingSymbol, extractionRuleId: "html-form-action-v0.1", attributes: { action, method: normalizeText(node.method) || "GET" }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "JS_FETCH" || node.kind === "JS_AJAX") {
        const target = node.target?.value;
        const dynamic = node.target?.dynamic === true || node.expression_truncated === true || typeof target !== "string" || target.trim() === "";
        const kind = node.kind === "JS_FETCH" ? "FETCH" : "AJAX";
        if (dynamic) addFact(makeDynamicFact({ file, language: nodeLanguage, node, sourceKind: kind, expression: node.expression || `${kind.toLowerCase()} target`, enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language: nodeLanguage, node, kind, normalizedExpression: target, enclosingSymbol, extractionRuleId: `${kind.toLowerCase()}-target-v0.1`, attributes: { target, method: normalizeText(node.method?.value) || "GET", ...(node.wrapper ? { wrapper: node.wrapper } : {}) }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "CSS_REFERENCE") {
        const target = typeof node.target === "string" ? node.target : "";
        const dynamic = node.dynamic === true || target.trim() === "";
        if (dynamic) addFact(makeDynamicFact({ file, language: nodeLanguage, node, sourceKind: "CSS_ASSET", expression: node.expression || "css asset", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language: nodeLanguage, node, kind: "CSS_ASSET", normalizedExpression: target, enclosingSymbol, extractionRuleId: `css-${node.reference_kind ?? "asset"}-v0.1`, attributes: { target, reference_kind: node.reference_kind ?? "asset" }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "JS_ASSET") {
        const target = typeof node.target === "string" ? node.target : "";
        if (node.dynamic === true || target.trim() === "") addFact(makeDynamicFact({ file, language: nodeLanguage, node, sourceKind: "INCLUDE", expression: node.expression || "script asset", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language: nodeLanguage, node, kind: "INCLUDE", normalizedExpression: target, enclosingSymbol, extractionRuleId: "html-script-src-v0.1", attributes: { template: target, include_phase: "client" }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind === "SQL_QUERY") {
        const tables = Array.isArray(node.tables) ? node.tables : [];
        const dynamicTables = Array.isArray(node.dynamic_tables) ? node.dynamic_tables : [];
        const expression = tables.length > 0 ? tables.join(", ") : dynamicTables.length > 0 ? dynamicTables.join(", ") : node.dynamic_sql === true ? node.expression ?? "dynamic sql query" : "visible sql query";
        addFact(makeFact({ file, language: nodeLanguage, node, kind: "QUERY", normalizedExpression: expression, enclosingSymbol, extractionRuleId: node.statement_kind === "queryExecute" ? "queryexecute-sql-v0.1" : "visible-sql-tables-v0.1", attributes: { tables, dynamic_tables: dynamicTables, dynamic_sql: node.dynamic_sql === true, sql_expression: node.dynamic_sql === true ? node.expression ?? null : null, statement_kind: node.statement_kind ?? "visible_sql", datasource: node.datasource ?? null, datasource_expression: node.datasource_expression ?? null, datasource_dynamic: node.datasource_dynamic === true }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.kind !== "CFML_TAG") continue;
      const nodeExpression = normalizeText(node.expression);
      const nodeAttributes = {};
      for (const item of node.attributes ?? []) {
        if (item.value !== null && item.truncated !== true) nodeAttributes[item.name] = item.value;
      }

      if (node.closing) {
        if (node.name === "cffunction") methodName = null;
        if (node.name === "cfcomponent") componentName = null;
        if (node.name === "cfif") conditionStack.pop();
        if (node.name === "cfswitch") {
          const frame = switchFrames.pop();
          if (frame) conditionStack.splice(frame.stackIndex, 1);
        }
        activeCondition = currentCondition(conditionStack);
        continue;
      }
      if (node.name === "cfcomponent") {
        const name = literalAttribute(node, "name");
        const extendsName = literalAttribute(node, "extends");
        const implementsNames = splitList(literalAttribute(node, "implements"));
        if (name === null) {
          addFact(makeDynamicFact({ file, language, node, sourceKind: "COMPONENT", expression: nodeAttributes.name ?? "component name", enclosingSymbol, ordinal: factOrdinal++ }));
        } else {
          componentName = name;
          addFact(makeFact({ file, language, node, kind: "COMPONENT", normalizedExpression: `component ${name}`, enclosingSymbol: null, extractionRuleId: "cfc-component-v0.1", attributes: { component_name: name, extends: extendsName, implements: implementsNames }, ordinal: factOrdinal++ }));
        }
        continue;
      }
      if (node.name === "cffunction") {
        const name = literalAttribute(node, "name");
        if (name === null) {
          addFact(makeDynamicFact({ file, language, node, sourceKind: "METHOD", expression: nodeAttributes.name ?? "method name", enclosingSymbol, ordinal: factOrdinal++ }));
        } else {
          methodName = componentName ? `${componentName}.${name}` : name;
          addFact(makeFact({ file, language, node, kind: "METHOD", normalizedExpression: `method ${methodName}`, enclosingSymbol: componentName, extractionRuleId: "cfc-method-v0.1", attributes: { method_name: name, access: literalAttribute(node, "access") }, ordinal: factOrdinal++ }));
          if (path.basename(file).toLowerCase() === "application.cfc" && APPLICATION_HOOK_NAMES.has(name.toLowerCase())) addFact(makeFact({ file, language, node, kind: "APPLICATION_HOOK", normalizedExpression: `application hook ${name}`, enclosingSymbol: componentName, extractionRuleId: "application-hook-v0.1", attributes: { application_name: file, hook_name: name }, ordinal: factOrdinal++ }));
        }
        continue;
      }
      if (node.name === "cflocation") {
        const url = literalAttribute(node, "url");
        if (url === null || dynamicValue(node, ["url"])) addFact(makeDynamicFact({ file, language, node, sourceKind: "REDIRECT", expression: nodeAttributes.url ?? "redirect url", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "REDIRECT", normalizedExpression: url, enclosingSymbol, extractionRuleId: "cflocation-url-v0.1", attributes: { url, status_code: literalAttribute(node, "statuscode") }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfquery") {
        const hasVisibleSqlNode = nodes.some((item) => item?.kind === "SQL_QUERY" && item.container_byte_start === node.byte_start);
        if (!hasVisibleSqlNode) addFact(makeFact({ file, language, node, kind: "QUERY", normalizedExpression: `query ${literalAttribute(node, "name") ?? file}`, enclosingSymbol, extractionRuleId: "cfquery-container-v0.1", attributes: { query_name: literalAttribute(node, "name"), datasource: literalAttribute(node, "datasource"), datasource_expression: dynamicValue(node, ["datasource"]) ? nodeAttributes.datasource ?? null : null, dynamic_tables: [], datasource_dynamic: dynamicValue(node, ["datasource"]) }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfinclude") {
        const template = literalAttribute(node, "template");
        if (template === null || dynamicValue(node, ["template"])) {
          addFact(makeDynamicFact({ file, language, node, sourceKind: "INCLUDE", expression: nodeAttributes.template ?? "cfinclude template", enclosingSymbol, ordinal: factOrdinal++ }));
        } else {
          addFact(makeFact({ file, language, node, kind: "INCLUDE", normalizedExpression: template, enclosingSymbol, extractionRuleId: "cfinclude-path-v0.1", attributes: { template, include_phase: "page", order_index: facts.filter((item) => item.kind === "INCLUDE" && item.file === file).length + 1 }, ordinal: factOrdinal++ }));
        }
        continue;
      }
      if (node.name === "cfmodule") {
        const name = literalAttribute(node, "name") ?? literalAttribute(node, "template");
        if (name === null || dynamicValue(node, ["name", "template"])) {
          addFact(makeDynamicFact({ file, language, node, sourceKind: "CUSTOM_TAG", expression: nodeAttributes.name ?? nodeAttributes.template ?? "custom tag", enclosingSymbol, ordinal: factOrdinal++ }));
        } else {
          addFact(makeFact({ file, language, node, kind: "CUSTOM_TAG", normalizedExpression: `custom tag ${name}`, enclosingSymbol, extractionRuleId: "cfmodule-name-v0.1", attributes: { name }, ordinal: factOrdinal++ }));
        }
        continue;
      }
      if (node.name === "cfobject") {
        const component = literalAttribute(node, "component");
        if (component === null || dynamicValue(node, ["component"])) addFact(makeDynamicFact({ file, language, node, sourceKind: "INSTANTIATE", expression: nodeAttributes.component ?? "component", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "INSTANTIATE", normalizedExpression: component, enclosingSymbol, extractionRuleId: "cfobject-component-v0.1", attributes: { component }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfinvoke") {
        const component = literalAttribute(node, "component");
        const method = literalAttribute(node, "method");
        if (component === null || method === null || dynamicValue(node, ["component", "method"])) addFact(makeDynamicFact({ file, language, node, sourceKind: "INVOKE", expression: `${nodeAttributes.component ?? "component"}.${nodeAttributes.method ?? "method"}`, enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "INVOKE", normalizedExpression: `${component}.${method}`, enclosingSymbol, extractionRuleId: "cfinvoke-component-method-v0.1", attributes: { component, method }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfimport") {
        const importPath = literalAttribute(node, "path");
        const prefix = literalAttribute(node, "prefix");
        if (importPath === null || dynamicValue(node, ["path"])) addFact(makeDynamicFact({ file, language, node, sourceKind: "MAPPING", expression: nodeAttributes.path ?? "mapping path", enclosingSymbol, ordinal: factOrdinal++ }));
        else addFact(makeFact({ file, language, node, kind: "MAPPING", normalizedExpression: importPath, enclosingSymbol, extractionRuleId: "cfimport-path-v0.1", attributes: { path: importPath, prefix }, ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfset") {
        const target = assignmentTarget(node.expression);
        if (target !== null) addFact(makeFact({ file, language, node, kind: "SCOPE_WRITE", normalizedExpression: target, enclosingSymbol, extractionRuleId: "cfset-scope-write-v0.1", attributes: { target, references: scopeReferences(node.expression.slice(node.expression.indexOf("=") + 1)) }, ordinal: factOrdinal++ }));
        else addFact(makeDynamicFact({ file, language, node, sourceKind: "SCOPE_WRITE", expression: node.expression ?? "cfset", enclosingSymbol, unresolvedReason: /(?:^|=)\s*#|[\[\]]|\bevaluate\s*\(/iu.test(node.expression ?? "") ? "GENERATED_SYMBOL" : "DYNAMIC_EXPRESSION", ordinal: factOrdinal++ }));
        continue;
      }
      if (node.name === "cfparam") {
        const target = literalAttribute(node, "name");
        const defaultValue = attribute(node, "default")?.value;
        if (target !== null) addFact(makeFact({ file, language, node, kind: "SCOPE_WRITE", normalizedExpression: target, enclosingSymbol, extractionRuleId: "cfparam-scope-write-v0.1", attributes: { target, references: scopeReferences(defaultValue) }, ordinal: factOrdinal++ }));
        else addFact(makeDynamicFact({ file, language, node, sourceKind: "SCOPE_WRITE", expression: nodeAttributes.name ?? "cfparam name", enclosingSymbol, unresolvedReason: "DYNAMIC_EXPRESSION", ordinal: factOrdinal++ }));
        continue;
      }
      if (CONTROL_FLOW_TAGS.has(node.name)) {
        const controlKind = node.name.slice(2);
        const expression = nodeExpression || (node.name === "cfloop" ? nodeAttributes.condition ?? nodeAttributes.query ?? nodeAttributes.index ?? "loop" : "");
        const references = node.name === "cfreturn" ? scopeReferences(nodeExpression) : [];
        addFact(makeFact({ file, language, node, kind: "CONTROL_FLOW", normalizedExpression: `${controlKind}${expression ? ` ${expression}` : ""}`, enclosingSymbol, extractionRuleId: `control-${controlKind}-v0.1`, attributes: { control_kind: controlKind, ...(references.length > 0 ? { references } : {}), ...(Object.keys(nodeAttributes).length > 0 ? { parameters: nodeAttributes } : {}) }, ordinal: factOrdinal++ }));
        continue;
      }
      if (["cfif", "cfelseif", "cfelse", "cfswitch", "cfcase", "cfdefaultcase"].includes(node.name)) {
        const condition = conditionFor(node, node.name === "cfelse" ? currentCondition(conditionStack) : null);
        if (condition) addFact(makeFact({ file, language, node, kind: "CONDITION", normalizedExpression: condition.expression_normalized, enclosingSymbol, condition, extractionRuleId: `condition-${condition.branch_kind}-v0.1`, attributes: { branch_id: `${file}:${node.span.start_line}:${node.span.start_col}` }, ordinal: factOrdinal++ }));
        else addFact(makeDynamicFact({ file, language, node, sourceKind: "CONDITION", expression: node.expression ?? nodeAttributes.expression ?? nodeAttributes.value ?? "condition", enclosingSymbol, ordinal: factOrdinal++ }));
        if (node.name === "cfif") {
          if (!node.self_closing) conditionStack.push(condition);
        } else if (node.name === "cfelseif" || node.name === "cfelse") {
          if (conditionStack.length > 0) conditionStack[conditionStack.length - 1] = condition;
          else if (!node.self_closing) conditionStack.push(condition);
        } else if (node.name === "cfswitch") {
          if (!node.self_closing) {
            const stackIndex = conditionStack.length;
            conditionStack.push(condition);
            switchFrames.push({ stackIndex, condition });
          }
        } else if (!node.self_closing) {
          const frame = switchFrames.at(-1);
          if (frame && frame.stackIndex === conditionStack.length - 1) {
            conditionStack[frame.stackIndex] = combineSwitchCase(frame.condition, condition, node.name === "cfdefaultcase");
          }
        }
        activeCondition = currentCondition(conditionStack);
        continue;
      }
    }
    activeCondition = null;
  }

  activeCondition = null;
  if (!shouldStop("facts:repository-actions")) factOrdinal = appendRepositoryActionFacts(facts, addFact, factOrdinal);
  else complete = false;

  facts.sort((left, right) => {
    const leftKey = [left.file, left.span.start_line, left.span.start_col, left.span.end_line, left.span.end_col, left.kind, left.fact_id].join("\0");
    const rightKey = [right.file, right.span.start_line, right.span.start_col, right.span.end_line, right.span.end_col, right.kind, right.fact_id].join("\0");
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  diagnostics.sort((left, right) => {
    const leftKey = [left.severity === "info" ? 0 : left.severity === "warning" ? 1 : 2, left.code, left.id].join("\0");
    const rightKey = [right.severity === "info" ? 0 : right.severity === "warning" ? 1 : 2, right.code, right.id].join("\0");
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });

  const parserVersions = [...new Set(parserResults.map((item) => item.parser_version).filter((value) => typeof value === "string"))].sort();
  const parser = parserSummary(parserResults, files.length, parserName, parserVersions.length === 1 ? parserVersions[0] : "mixed");
  if (parser.completeness !== "complete") complete = false;

  return {
    schema_version: FACT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: toolVersion },
    source_files: files.map((file) => ({ file: file.path, language: languageForPath(file.path), fingerprint: file.content_sha256, ...(Number.isSafeInteger(file.bytes) ? { bytes: file.bytes } : {}) })),
    parser,
    complete,
    facts,
    diagnostics,
    stats: {
      source_file_count: files.length,
      fact_count: facts.length,
      diagnostic_count: diagnostics.length,
    },
  };
}
