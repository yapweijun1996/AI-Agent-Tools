import { readFile } from "node:fs/promises";

const corpus = JSON.parse(await readFile("fixtures/corpus.json", "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(corpus.corpusVersion === "1", "unsupported fixture corpus version");
assert(Array.isArray(corpus.cases) && corpus.cases.length >= 20, "fixture corpus is too small");

const ids = new Set();
const families = new Set();
const byId = new Map();
const streams = new Set(["stdout", "stderr", "combined", "unknown"]);

function expandContent(artifact, caseId) {
  if (typeof artifact.content === "string") return artifact.content;
  const generator = artifact.generator;
  assert(generator && typeof generator === "object", `${caseId}: artifact content is missing`);
  if (generator.type === "repeat") {
    assert(Number.isInteger(generator.count) && generator.count >= 0 && generator.count <= 200000, `${caseId}: invalid repeat generator`);
    return generator.value.repeat(generator.count);
  }
  if (generator.type === "repeat-lines") {
    assert(typeof generator.line === "string" && Number.isInteger(generator.count), `${caseId}: invalid repeat-lines generator`);
    assert(generator.count >= 0 && generator.count <= 200000, `${caseId}: repeat-lines count out of bounds`);
    return `${generator.line}\n`.repeat(generator.count);
  }
  throw new Error(`${caseId}: unknown generator ${generator.type}`);
}

function validateInput(input, caseId) {
  assert(input && input.schemaVersion === "1", `${caseId}: input schemaVersion must be 1`);
  assert(Array.isArray(input.artifacts), `${caseId}: artifacts must be an array`);
  const artifactIds = new Set();
  let totalBytes = 0;
  for (const artifact of input.artifacts) {
    assert(artifact && typeof artifact.id === "string" && artifact.id.length > 0, `${caseId}: invalid artifact id`);
    assert(!artifactIds.has(artifact.id), `${caseId}: duplicate artifact id`);
    artifactIds.add(artifact.id);
    assert(streams.has(artifact.stream), `${caseId}: invalid artifact stream`);
    const content = expandContent(artifact, caseId);
    assert(!/[\uD800-\uDFFF]/u.test(content), `${caseId}: lone surrogate in fixture content`);
    totalBytes += Buffer.byteLength(content, "utf8");
  }
  assert(totalBytes <= 20971520, `${caseId}: request exceeds frozen byte budget`);
  return input.artifacts.map((artifact) => ({...artifact, content: expandContent(artifact, caseId)}));
}

for (const fixture of corpus.cases) {
  assert(fixture && typeof fixture.id === "string", "fixture id is missing");
  assert(!ids.has(fixture.id), `duplicate fixture id: ${fixture.id}`);
  ids.add(fixture.id);
  byId.set(fixture.id, fixture);
  assert(typeof fixture.family === "string", `${fixture.id}: family is missing`);
  families.add(fixture.family);
  assert(fixture.input && fixture.expected, `${fixture.id}: input or expected assertion is missing`);
  const artifacts = validateInput(fixture.input, fixture.id);
  assert(["complete", "partial", "error"].includes(fixture.expected.status), `${fixture.id}: invalid expected status`);
  if (fixture.expected.truncationReasons) {
    assert(Array.isArray(fixture.expected.truncationReasons), `${fixture.id}: truncationReasons must be an array`);
    assert(fixture.expected.status === "partial", `${fixture.id}: truncation requires partial status`);
  }
  if (fixture.family === "determinism") {
    assert(typeof fixture.determinismGroup === "string", `${fixture.id}: determinism group is missing`);
    assert(fixture.expected.byteStableWith && typeof fixture.expected.byteStableWith === "string", `${fixture.id}: determinism partner is missing`);
  }
  if (fixture.family === "security") {
    const text = artifacts.map((artifact) => artifact.content).join("\n");
    assert(!/(sk-live|AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{20,})/u.test(text), `${fixture.id}: fixture contains a credential-looking live value`);
  }
}

const requiredFamilies = ["producer", "structural", "failure", "security", "determinism", "agent-facing"];
for (const family of requiredFamilies) assert(families.has(family), `missing fixture family: ${family}`);

for (const fixture of corpus.cases.filter((candidate) => candidate.family === "determinism")) {
  const partner = byId.get(fixture.expected.byteStableWith);
  assert(partner?.determinismGroup === fixture.determinismGroup, `${fixture.id}: determinism partner mismatch`);
  assert(JSON.stringify(fixture.input) === JSON.stringify(partner.input), `${fixture.id}: repeated inputs differ`);
}

const longLine = byId.get("failure-long-line");
assert(expandContent(longLine.input.artifacts[0], longLine.id).length > 16384, "long-line fixture does not cross the frozen limit");
const excessive = byId.get("failure-excess-diagnostics");
assert(expandContent(excessive.input.artifacts[0], excessive.id).split("\n").length - 1 === 201, "excessive-diagnostics fixture count changed");
assert(corpus.cases.some((fixture) => fixture.producer === "typescript"), "TypeScript fixture missing");
assert(corpus.cases.some((fixture) => fixture.producer === "vitest"), "Vitest fixture missing");
assert(corpus.cases.some((fixture) => fixture.producer === "eslint"), "ESLint fixture missing");
assert(corpus.cases.some((fixture) => fixture.producer === "generic-structured"), "generic structured fixture missing");
assert(corpus.cases.some((fixture) => fixture.producer === "generic-text"), "generic text fixture missing");

console.log(`fixture corpus check: passed (${corpus.cases.length} cases, ${families.size} families)`);
