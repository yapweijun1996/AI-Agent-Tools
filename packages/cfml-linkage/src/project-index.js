const INDEX_SCHEMA_VERSION = "agent-cfml-linkage-index/v0.1";
const INDEX_NAMES = Object.freeze([
  "pathIndex",
  "componentIndex",
  "methodIndex",
  "applicationIndex",
  "mappingIndex",
  "customTagIndex",
  "symbolIndex",
  "queryIndex",
  "factByFile",
]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function factSortKey(fact) {
  const span = fact.span ?? {};
  return [
    fact.file ?? "",
    Number.isSafeInteger(span.start_line) ? span.start_line : 0,
    Number.isSafeInteger(span.start_col) ? span.start_col : 0,
    Number.isSafeInteger(span.end_line) ? span.end_line : 0,
    Number.isSafeInteger(span.end_col) ? span.end_col : 0,
    fact.kind ?? "",
    fact.fact_id ?? "",
  ].join("\0");
}

function compareFacts(left, right) {
  return compareStrings(factSortKey(left), factSortKey(right));
}

function copyAndFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) throw new TypeError("index input must not contain cyclic objects");
  seen.add(value);
  if (Array.isArray(value)) {
    const copy = value.map((item) => copyAndFreeze(item, seen));
    seen.delete(value);
    return Object.freeze(copy);
  }
  const copy = Object.create(null);
  for (const key of Object.keys(value).sort(compareStrings)) copy[key] = copyAndFreeze(value[key], seen);
  seen.delete(value);
  return Object.freeze(copy);
}

function frozenKeyIndex(values) {
  const output = Object.create(null);
  for (const key of Object.keys(values).sort(compareStrings)) {
    output[key] = Object.freeze(values[key].slice().sort(compareFacts));
  }
  return Object.freeze(output);
}

function addKey(values, key, fact) {
  if (typeof key !== "string" || key.trim() === "") return;
  const normalized = key.trim();
  if (!values[normalized]) values[normalized] = [];
  values[normalized].push(fact);
}

function attributeValue(fact, name) {
  const value = fact.attributes?.[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function addQueryKeys(values, fact) {
  addKey(values, fact.file, fact);
  for (const table of Array.isArray(fact.attributes?.tables) ? fact.attributes.tables : []) addKey(values, table, fact);
  addKey(values, attributeValue(fact, "datasource"), fact);
}

function addMethodKeys(values, fact) {
  const methodName = attributeValue(fact, "method_name");
  if (!methodName) return;
  addKey(values, methodName, fact);
  const enclosing = typeof fact.enclosing_symbol === "string" && fact.enclosing_symbol.trim() !== "" ? fact.enclosing_symbol.trim() : null;
  if (enclosing) addKey(values, `${enclosing}.${methodName}`, fact);
}

function sourceFilesFrom({ factBundle, snapshot }) {
  const values = snapshot?.files ?? factBundle.source_files;
  if (!Array.isArray(values) || values.length === 0) throw new TypeError("factBundle or snapshot must contain source files");
  return values.map((value) => {
    if (!value || typeof value.file !== "string" && typeof value.path !== "string") throw new TypeError("source files must contain file or path");
    return {
      file: value.file ?? value.path,
      language: value.language,
      fingerprint: value.fingerprint ?? value.content_sha256,
      ...(Number.isSafeInteger(value.bytes) ? { bytes: value.bytes } : {}),
    };
  });
}

function indexDiagnostics(facts, sourceFiles) {
  const knownFiles = new Set(sourceFiles.map((file) => file.file));
  const missing = [...new Set(facts.map((fact) => fact.file).filter((file) => !knownFiles.has(file)))].sort(compareStrings);
  return missing.map((file) => ({ code: "INDEX_SOURCE_FILE_MISSING", severity: "error", file, message: "Fact references a source file absent from the source-file index." }));
}

/**
 * Build immutable lookup indexes from a Fact IR bundle. Index entries contain
 * frozen copies of facts so later resolver passes cannot mutate source data or
 * make output depend on caller-owned object order.
 */
export function buildProjectIndexes({ factBundle, snapshot = null } = {}) {
  if (!factBundle || typeof factBundle !== "object" || !Array.isArray(factBundle.facts)) throw new TypeError("factBundle with facts is required");
  const sourceFiles = sourceFilesFrom({ factBundle, snapshot });
  const sourceFileValues = Object.create(null);
  const sourceFileFacts = Object.create(null);
  for (const sourceFile of sourceFiles) {
    if (typeof sourceFile.file !== "string" || sourceFile.file.trim() === "") throw new TypeError("source file paths must be non-empty strings");
    const frozen = copyAndFreeze(sourceFile);
    addKey(sourceFileValues, sourceFile.file, frozen);
  }
  const pathIndex = frozenKeyIndex(sourceFileValues);
  const facts = factBundle.facts.map((fact) => {
    if (!fact || typeof fact !== "object" || typeof fact.file !== "string" || typeof fact.kind !== "string") throw new TypeError("facts must contain file and kind");
    return copyAndFreeze(fact);
  }).sort(compareFacts);
  const indexes = Object.fromEntries(INDEX_NAMES.filter((name) => name !== "pathIndex" && name !== "factByFile").map((name) => [name, Object.create(null)]));

  for (const fact of facts) {
    addKey(sourceFileFacts, fact.file, fact);
    if (fact.kind === "COMPONENT") addKey(indexes.componentIndex, attributeValue(fact, "component_name"), fact);
    if (fact.kind === "METHOD") addMethodKeys(indexes.methodIndex, fact);
    if (fact.kind === "APPLICATION_HOOK") addKey(indexes.applicationIndex, attributeValue(fact, "application_name") ?? fact.file, fact);
    if (fact.kind === "MAPPING") addKey(indexes.mappingIndex, attributeValue(fact, "path") ?? fact.normalized_expression, fact);
    if (fact.kind === "CUSTOM_TAG") addKey(indexes.customTagIndex, attributeValue(fact, "name") ?? fact.normalized_expression, fact);
    if (fact.kind === "COMPONENT" || fact.kind === "METHOD") {
      addKey(indexes.symbolIndex, fact.normalized_expression, fact);
      addKey(indexes.symbolIndex, fact.enclosing_symbol, fact);
      if (fact.kind === "COMPONENT") addKey(indexes.symbolIndex, attributeValue(fact, "component_name"), fact);
      if (fact.kind === "METHOD") addMethodKeys(indexes.symbolIndex, fact);
    }
    if (fact.kind === "QUERY") addQueryKeys(indexes.queryIndex, fact);
  }

  const frozenIndexes = Object.create(null);
  for (const name of INDEX_NAMES) {
    frozenIndexes[name] = name === "pathIndex" ? pathIndex : frozenKeyIndex(name === "factByFile" ? sourceFileFacts : indexes[name]);
  }
  const diagnostics = indexDiagnostics(facts, sourceFiles);
  return Object.freeze({
    schema_version: INDEX_SCHEMA_VERSION,
    source_files: Object.freeze(sourceFiles.map((value) => copyAndFreeze(value)).sort((left, right) => compareStrings(left.file, right.file))),
    source_fingerprint: typeof snapshot?.source_fingerprint === "string" ? snapshot.source_fingerprint : null,
    complete: factBundle.complete === true && diagnostics.length === 0,
    diagnostics: Object.freeze(diagnostics),
    ...frozenIndexes,
    stats: Object.freeze({
      source_file_count: sourceFiles.length,
      fact_count: facts.length,
      indexed_fact_count: facts.length,
      diagnostic_count: diagnostics.length,
    }),
  });
}

/**
 * Return a deterministic lookup state without allowing callers to mutate the
 * index. Missing, unique, and ambiguous are intentionally distinct states.
 */
export function lookupIndex(indexes, indexName, key) {
  if (!indexes || !INDEX_NAMES.includes(indexName)) throw new TypeError("unknown project index");
  if (typeof key !== "string" || key.trim() === "") return { state: "missing", candidates: Object.freeze([]) };
  const candidates = indexes[indexName]?.[key.trim()] ?? [];
  const state = candidates.length === 0 ? "missing" : candidates.length === 1 ? "unique" : "ambiguous";
  return { state, candidates };
}
