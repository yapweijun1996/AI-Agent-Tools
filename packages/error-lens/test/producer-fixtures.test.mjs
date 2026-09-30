import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parse } from "../dist/src/index.js";

const corpus = JSON.parse(readFileSync(new URL("../fixtures/corpus.json", import.meta.url), "utf8"));
const cases = new Map(corpus.cases.map((fixture) => [fixture.id, fixture]));
const fixture = (id) => {
  const value = cases.get(id);
  assert.ok(value, `missing fixture ${id}`);
  return value;
};
const parseFixture = (id) => parse(fixture(id).input);
const firstDiagnostic = (id) => parseFixture(id).data.diagnostics[0];
const materialize = (input) => {
  const copy = structuredClone(input);
  for (const artifact of copy.artifacts) {
    if (artifact.generator?.type === "repeat") artifact.content = artifact.generator.value.repeat(artifact.generator.count);
    if (artifact.generator?.type === "repeat-lines") artifact.content = `${artifact.generator.line}\n`.repeat(artifact.generator.count);
    delete artifact.generator;
  }
  return copy;
};

test("approved producer fixtures return evidence-backed diagnostics", () => {
  const expectations = [
    ["producer-typescript-basic", "typescript", "TS2339", "src/order.ts", 41, 18, "confirmed"],
    ["producer-vitest-assertion", "vitest", null, "src/order.test.ts", 42, 17, "confirmed"],
    ["producer-eslint-rule", "eslint", "no-console", "/workspace/project/src/order.ts", 7, 3, "confirmed"],
    ["producer-generic-structured", "generic-structured", "E_ORDER", "src/order.ts", 12, 4, "confirmed"],
    ["producer-generic-text-candidate", "generic-text", null, "src/unknown.ts", 9, 2, "candidate"],
  ];
  for (const [id, producer, code, file, line, column, confidence] of expectations) {
    const result = parseFixture(id);
    const diagnostic = result.data.diagnostics[0];
    assert.equal(result.status, "complete", id);
    assert.deepEqual(result.data.producers.map((item) => item.name), [producer], id);
    assert.equal(diagnostic?.code, code, id);
    assert.equal(diagnostic?.location?.file, file, id);
    assert.equal(diagnostic?.location?.line, line, id);
    assert.equal(diagnostic?.location?.column, column, id);
    assert.equal(diagnostic?.confidence, confidence, id);
    assert.ok((diagnostic?.evidence.length ?? 0) > 0, id);
  }

  const slashRule = parseFixture("producer-eslint-slash-rule");
  assert.equal(slashRule.data.diagnostics[0]?.location?.file, "/workspace/project/src/order.ts");
  assert.equal(slashRule.data.diagnostics[0]?.code, "import/no-unresolved");
});

test("structural and nested producer fixtures preserve the relevant producer", () => {
  assert.equal(firstDiagnostic("structural-ansi-crlf")?.code, "TS2339");
  assert.equal(firstDiagnostic("structural-mixed-streams")?.code, "TS7006");
  assert.equal(firstDiagnostic("structural-windows-rooted-path")?.location?.file, "src/order.ts");
  assert.equal(firstDiagnostic("structural-multiline-diagnostic")?.location?.line, 42);

  const multipleFailures = parseFixture("producer-vitest-multiple-failures");
  assert.deepEqual(multipleFailures.data.diagnostics.map((diagnostic) => diagnostic.location?.file), ["src/first.test.ts", "src/second.test.ts"]);
  assert.deepEqual(multipleFailures.data.diagnostics.map((diagnostic) => diagnostic.confidence), ["strong", "strong"]);

  const nested = parseFixture("structural-nested-producers");
  assert.deepEqual(nested.data.producers.map((item) => item.name), ["vitest"]);
  assert.equal(nested.data.producers.some((item) => item.name === "npm"), false);
  assert.equal(nested.status, "complete");

  const mixedArtifact = parse({
    schemaVersion: "1",
    artifacts: [{
      id: "stderr",
      stream: "stderr",
      content: [
        "src/order.ts(1,1): error TS2339: missing",
        "/workspace/project/src/order.ts",
        "  2:3 error no-console  no-console",
        " FAIL src/order.test.ts",
        "AssertionError: expected 1 to be 2",
        " ❯ src/order.test.ts:4:2",
      ].join("\n"),
    }],
  });
  assert.deepEqual(mixedArtifact.data.producers.map((producer) => producer.name), ["typescript", "eslint", "vitest"]);
  assert.deepEqual(mixedArtifact.data.diagnostics.map((diagnostic) => diagnostic.producerId), ["typescript", "eslint", "vitest"]);
});

test("failure fixtures stay explicit and bounded", () => {
  const malformed = parseFixture("failure-malformed-structured");
  assert.equal(malformed.status, "partial");
  assert.equal(malformed.toolIssues[0]?.code, "STRUCTURED_INPUT_INVALID");
  assert.deepEqual(malformed.truncation.reasons, ["unsupported-format"]);

  const unsupported = parseFixture("failure-unsupported-format");
  assert.equal(unsupported.status, "partial");
  assert.equal(unsupported.data.diagnostics.length, 0);
  assert.ok(unsupported.truncation.reasons.includes("unsupported-format"));

  const truncated = parseFixture("failure-truncated-output");
  assert.equal(truncated.status, "partial");
  assert.deepEqual(truncated.truncation.reasons, ["diagnostics"]);
  assert.equal(truncated.data.diagnostics[0]?.confidence, "unknown");

  const incomplete = parseFixture("failure-incomplete-stack");
  assert.equal(incomplete.data.diagnostics[0]?.location, null);
  assert.equal(incomplete.data.diagnostics[0]?.confidence, "candidate");

  const longLine = parse(materialize(fixture("failure-long-line").input));
  assert.equal(longLine.status, "partial");
  assert.deepEqual(longLine.truncation.reasons, ["line-length"]);

  const excessive = parse(materialize(fixture("failure-excess-diagnostics").input));
  assert.equal(excessive.status, "partial");
  assert.ok(excessive.data.diagnostics.length <= 200);
  assert.ok(excessive.truncation.reasons.includes("diagnostics"));
  assert.equal(excessive.stats.diagnosticsBeforeLimit, 201);
});

test("security, determinism, and agent-facing fixtures preserve their contracts", () => {
  const security = parseFixture("security-redaction-families");
  const serializedSecurity = JSON.stringify(security);
  for (const secret of fixture("security-redaction-families").expected.forbidOutput) assert.equal(serializedSecurity.includes(secret), false, secret);
  assert.equal(security.status, "complete");
  const sanitizedEquivalent = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: "Error: [REDACTED]\n" }],
  });
  const sanitizedDiagnostic = security.data.diagnostics.find((diagnostic) => diagnostic.message === "[REDACTED]");
  assert.equal(sanitizedDiagnostic?.id, sanitizedEquivalent.data.diagnostics[0]?.id);
  const jsonDiagnostic = security.data.diagnostics.find((diagnostic) => diagnostic.message.includes("Authorization"));
  assert.equal(jsonDiagnostic?.message, "{\"Authorization\":\"Bearer [REDACTED]\",\"apiKey\":[REDACTED],\"AWS_SECRET_ACCESS_KEY\":[REDACTED]}");

  const alreadySanitized = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: JSON.stringify({ diagnostics: [{ message: "{\"apiKey\":\"[REDACTED]\",\"AWS_SECRET_ACCESS_KEY\":[REDACTED]} Authorization: \\\"Bearer [REDACTED]\\\" Authorization=Basic [REDACTED]", severity: "error" }] }) }],
  });
  assert.equal(alreadySanitized.data.diagnostics[0]?.message, "{\"apiKey\":\"[REDACTED]\",\"AWS_SECRET_ACCESS_KEY\":[REDACTED]} Authorization: \\\"Bearer [REDACTED]\\\" Authorization=Basic [REDACTED]");

  const equalsAuthorization = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: "Error: Authorization=Bearer EXAMPLE_AUTH_TOKEN_VALUE_1234567890\n" }],
  });
  assert.equal(equalsAuthorization.data.diagnostics[0]?.message, "Authorization=Bearer [REDACTED]");

  const quotedAuthorization = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: JSON.stringify({ diagnostics: [{ message: "Authorization: \"Bearer EXAMPLE_QUOTED_AUTH_VALUE\"", severity: "error" }] }) }],
  });
  assert.equal(quotedAuthorization.data.diagnostics[0]?.message, "Authorization: \"Bearer [REDACTED]\"");

  const metrics = parseFixture("security-benign-token-metrics");
  assert.equal(metrics.status, "complete");

  const repeatA = JSON.stringify(parseFixture("determinism-basic-a"));
  const repeatB = JSON.stringify(parseFixture("determinism-basic-b"));
  assert.equal(repeatA, repeatB);

  const agentFacing = parseFixture("agent-facing-location-evidence");
  const diagnostic = agentFacing.data.diagnostics[0];
  assert.equal(`${diagnostic?.location?.file}:${diagnostic?.location?.line}:${diagnostic?.location?.column}`, "src/services/order.ts:81:14");
  assert.ok((diagnostic?.evidence.length ?? 0) > 0);
});
