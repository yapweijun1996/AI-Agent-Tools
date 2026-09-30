import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
const root = (name) => resolve(here, name);

const readJson = async (name) => JSON.parse(await readFile(root(name), "utf8"));

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validate(value, schema, document, path = "$", errors = []) {
  if (schema.$ref) {
    const marker = "#/$defs/";
    if (!schema.$ref.startsWith(marker)) {
      errors.push(`${path}: unsupported reference ${schema.$ref}`);
      return errors;
    }
    return validate(value, document.$defs[schema.$ref.slice(marker.length)], document, path, errors);
  }

  if (schema.oneOf) {
    const matches = schema.oneOf.filter((candidate) => validate(value, candidate, document, path, []).length === 0);
    if (matches.length !== 1) errors.push(`${path}: expected exactly one schema branch, matched ${matches.length}`);
  }

  if (schema.anyOf) {
    const matches = schema.anyOf.some((candidate) => validate(value, candidate, document, path, []).length === 0);
    if (!matches) errors.push(`${path}: expected one schema branch to match`);
  }

  if (schema.const !== undefined && JSON.stringify(value) !== JSON.stringify(schema.const)) {
    errors.push(`${path}: expected constant ${JSON.stringify(schema.const)}`);
    return errors;
  }

  if (schema.enum && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path}: value is outside enum`);
    return errors;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => typeMatches(value, type))) {
      errors.push(`${path}: type mismatch`);
      return errors;
    }
  }

  if (value !== null && typeof value === "string") {
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) errors.push(`${path}: string is too short`);
    if (schema.maxLength !== undefined && length > schema.maxLength) errors.push(`${path}: string is too long`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: pattern mismatch`);
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: number is below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: number is above maximum`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) value.forEach((item, index) => validate(item, schema.items, document, `${path}[${index}]`, errors));
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    for (const name of schema.required ?? []) {
      if (!Object.hasOwn(value, name)) errors.push(`${path}: missing ${name}`);
    }
    const properties = schema.properties ?? {};
    for (const [name, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, name)) validate(value[name], child, document, `${path}.${name}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const name of Object.keys(value)) {
        if (!Object.hasOwn(properties, name)) errors.push(`${path}: unexpected ${name}`);
      }
    }
  }

  return errors;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertOrderedKeys(value, expected, label) {
  assert(JSON.stringify(Object.keys(value)) === JSON.stringify(expected), `${label}: key order mismatch`);
}

const schema = await readJson("agent-error-lens-v1.schema.json");
const validRequest = await readJson("examples/valid-request.json");
const validEmptyRequest = await readJson("examples/valid-empty-request.json");
const validResult = await readJson("examples/valid-complete-result.json");
const validPartialResult = await readJson("examples/valid-partial-result.json");
const validCapabilities = await readJson("examples/valid-capabilities.json");
const invalidRequest = await readJson("examples/invalid-request.json");
const invalidResult = await readJson("examples/invalid-result.json");

assert(schema.$id === "urn:agent-error-lens:contract:v1", "schema id changed unexpectedly");
assert(schema["x-agent-error-lens"].sourceOfTruth === "json-schema", "schema source-of-truth marker missing");
const limits = schema["x-agent-error-lens"].limits;
const expectedLimits = {
  maxArtifactBytes: 2097152,
  maxRequestBytes: 20971520,
  maxDiagnostics: 200,
  maxEvidenceSpanBytes: 65536,
  maxLineBytes: 16384,
  maxProcessedLines: 200000,
  maxParserMatches: 10000,
  maxTerminalSequences: 10000,
  maxProducerCandidates: 256,
  maxAggregateEvidenceBytes: 1048576,
  maxProducers: 64,
  maxToolIssues: 200,
  maxWarnings: 200,
  maxEvidencePerRecord: 32,
};
assert(JSON.stringify(limits) === JSON.stringify(expectedLimits), "deterministic limit policy changed unexpectedly");
const redaction = schema["x-agent-error-lens"].redaction;
assert(redaction.replacement === "[REDACTED]", "redaction replacement changed unexpectedly");
assert(JSON.stringify(redaction.benignKeys) === JSON.stringify(["inputTokens", "outputTokens", "totalTokens"]), "benign redaction keys changed unexpectedly");
assert(schema["x-agent-error-lens"].modulePolicy === "esm-only", "module policy changed unexpectedly");
assert(schema["x-agent-error-lens"].nodeRange === ">=20.11.0 <25", "Node.js target changed unexpectedly");

for (const [name, value, expectedValid] of [
  ["valid-request", validRequest, true],
  ["valid-empty-request", validEmptyRequest, true],
  ["valid-complete-result", validResult, true],
  ["valid-partial-result", validPartialResult, true],
  ["valid-capabilities", validCapabilities, true],
  ["invalid-request", invalidRequest, false],
  ["invalid-result", invalidResult, false],
]) {
  const errors = validate(value, schema, schema);
  assert((errors.length === 0) === expectedValid, `${name}: ${errors.join("; ")}`);
  console.log(`${name}: ${expectedValid ? "accepted" : "rejected"}`);
}

const unsafeLocationResult = structuredClone(validResult);
unsafeLocationResult.data.diagnostics[0].location.line = Number.MAX_SAFE_INTEGER + 1;
assert(validate(unsafeLocationResult, schema, schema).length > 0, "unsafe diagnostic coordinates must be rejected");

const artifact = validRequest.artifacts[0];
assert(Buffer.byteLength(artifact.content, "utf8") === validResult.stats.bytesReceived, "request/result byte stats disagree");
assert(validResult.stats.bytesProcessed === validResult.stats.bytesReceived, "complete result has inconsistent processed bytes");
assert(validResult.data.diagnostics.length === validResult.data.summary.diagnosticCount, "summary diagnostic count disagrees");
assert(validResult.data.producers.length === validResult.data.summary.producerCount, "summary producer count disagrees");

for (const producer of validResult.data.producers) {
  for (const evidence of producer.evidence) {
    assert(evidence.artifactId === artifact.id, "producer evidence references an unknown artifact");
    assert(evidence.start < evidence.end && evidence.end <= artifact.content.length, "producer evidence is not a valid UTF-16 range");
  }
}

for (const diagnostic of validResult.data.diagnostics) {
  const location = diagnostic.location;
  const identity = [
    validResult.schemaVersion,
    diagnostic.producerId,
    diagnostic.severity,
    diagnostic.phase,
    diagnostic.code,
    location?.file ?? null,
    location?.line ?? null,
    location?.column ?? null,
    diagnostic.message,
  ];
  const expectedId = `diag_${createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex")}`;
  assert(diagnostic.id === expectedId, "diagnostic id does not match the frozen identity algorithm");
  for (const evidence of diagnostic.evidence) {
    assert(evidence.artifactId === artifact.id, "diagnostic evidence references an unknown artifact");
    assert(evidence.start < evidence.end && evidence.end <= artifact.content.length, "diagnostic evidence is not a valid UTF-16 range");
  }
}

const partialDiagnostic = validPartialResult.data.diagnostics[0];
const partialIdentity = [
  validPartialResult.schemaVersion,
  partialDiagnostic.producerId,
  partialDiagnostic.severity,
  partialDiagnostic.phase,
  partialDiagnostic.code,
  null,
  null,
  null,
  partialDiagnostic.message,
];
const expectedPartialId = `diag_${createHash("sha256").update(JSON.stringify(partialIdentity), "utf8").digest("hex")}`;
assert(partialDiagnostic.id === expectedPartialId, "partial diagnostic id does not match the frozen identity algorithm");
assert(validPartialResult.status === "partial" && validPartialResult.truncation.truncated, "partial example does not expose truncation");

const keyOrder = schema["x-agent-error-lens"].canonicalJson.objectKeyOrder;
assertOrderedKeys(validRequest, keyOrder.request, "request");
assertOrderedKeys(validCapabilities, ["schemaVersion", "operations", "producers"], "capabilities");
assertOrderedKeys(validResult, keyOrder.result, "result");
assertOrderedKeys(validResult.data, keyOrder["result.data"], "result.data");
assertOrderedKeys(validResult.data.diagnostics[0], keyOrder.diagnostic, "diagnostic");
assertOrderedKeys(validResult.data.diagnostics[0].evidence[0], keyOrder.evidence, "evidence");

console.log("cross-field invariants: passed");
console.log("canonical key order: passed");
console.log("contract verification: passed");
