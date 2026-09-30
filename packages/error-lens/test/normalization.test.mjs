import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../dist/src/index.js";

function request(content, options) {
  return { schemaVersion: "1", artifacts: [{ id: "stderr", stream: "stderr", content }], options };
}

test("generic structured diagnostics preserve evidence and normalize a rooted path", () => {
  const content = JSON.stringify({
    diagnostics: [{ message: "order is invalid", severity: "error", file: "/workspace/project/src/order.ts", line: 12, column: 4, code: "E_ORDER" }],
  });
  const result = parse(request(content, { root: "/workspace/project" }));
  const diagnostic = result.data.diagnostics[0];

  assert.equal(result.status, "complete");
  assert.deepEqual(Object.keys(result), ["schemaVersion", "status", "data", "toolIssues", "warnings", "truncation", "stats"]);
  assert.deepEqual(result.data.producers.map((producer) => producer.name), ["generic-structured"]);
  assert.equal(diagnostic?.location?.file, "src/order.ts");
  assert.equal(diagnostic?.confidence, "confirmed");
  assert.equal(diagnostic?.code, "E_ORDER");
  assert.match(diagnostic?.id ?? "", /^diag_[0-9a-f]{64}$/u);
  const evidence = diagnostic?.evidence[0];
  assert.ok(evidence);
  assert.equal(content.slice(evidence.start, evidence.end), content);
});

test("producer outcome is sanitized and kept in canonical envelope order", () => {
  const result = parse({
    schemaVersion: "1",
    artifacts: [],
    producerOutcome: { signal: null, exitCode: 1, command: "npm test" },
  });

  assert.deepEqual(Object.keys(result), ["schemaVersion", "status", "producerOutcome", "data", "toolIssues", "warnings", "truncation", "stats"]);
  assert.deepEqual(result.producerOutcome, { command: "npm test", exitCode: 1, signal: null });
});

test("ANSI removal and CRLF normalization retain a raw evidence span", () => {
  const json = JSON.stringify({
    diagnostics: [{ message: "bad", severity: "error", file: "C:\\workspace\\project\\src\\order.ts", line: 4, column: 2, code: "E_BAD" }],
  });
  const content = `\u001b[31m${json}\u001b[0m\r\n`;
  const result = parse(request(content, { root: "C:\\workspace\\project" }));
  const evidence = result.data.diagnostics[0]?.evidence[0];

  assert.equal(result.status, "complete");
  assert.equal(result.data.diagnostics[0]?.location?.file, "src/order.ts");
  assert.ok(evidence);
  assert.equal(evidence.offsetUnit, "utf16-code-unit");
  assert.match(content.slice(evidence.start, evidence.end), /\{"diagnostics"/u);
});

test("outside-root paths are withheld and reported as a warning", () => {
  const content = JSON.stringify({ diagnostics: [{ message: "outside", severity: "error", file: "../outside.ts", line: 1, column: 1 }] });
  const result = parse(request(content, { root: "/workspace/project" }));

  assert.equal(result.status, "complete");
  assert.equal(result.data.diagnostics[0]?.location, null);
  assert.equal(result.warnings[0]?.code, "PATH_OUTSIDE_ROOT");
});

test("malformed structured input fails closed with partial status", () => {
  const result = parse(request("{\"diagnostics\":["));

  assert.equal(result.status, "partial");
  assert.equal(result.data.diagnostics.length, 0);
  assert.equal(result.toolIssues[0]?.code, "STRUCTURED_INPUT_INVALID");
  assert.deepEqual(result.truncation.reasons, ["unsupported-format"]);
});

test("structured records reject malformed Unicode and unsafe coordinates", () => {
  const malformedUnicode = parse(request(String.raw`{"diagnostics":[{"message":"\ud800","severity":"error"}]}`));
  assert.equal(malformedUnicode.status, "partial");
  assert.equal(malformedUnicode.data.diagnostics.length, 0);
  assert.equal(malformedUnicode.toolIssues[0]?.code, "STRUCTURED_DIAGNOSTIC_INVALID");

  const unsafeCoordinate = parse(request(JSON.stringify({
    diagnostics: [{ message: "unsafe line", severity: "error", line: Number.MAX_SAFE_INTEGER + 1 }],
  })));
  assert.equal(unsafeCoordinate.status, "partial");
  assert.equal(unsafeCoordinate.data.diagnostics.length, 0);
  assert.equal(unsafeCoordinate.toolIssues[0]?.code, "STRUCTURED_DIAGNOSTIC_INVALID");
});

test("structured string limits use Unicode code points consistently", () => {
  const code = "😀".repeat(65);
  const result = parse(request(JSON.stringify({ diagnostics: [{ message: "unicode code points", severity: "error", code }] })));

  assert.equal(result.status, "complete");
  assert.equal(result.data.diagnostics[0]?.code, code);
});

test("line and request validation remain bounded", () => {
  const longLine = parse(request("x".repeat(16_385)));
  assert.equal(longLine.status, "partial");
  assert.ok(longLine.truncation.reasons.includes("line-length"));

  const invalid = parse({ schemaVersion: "1", artifacts: [{ id: "stderr", stream: "stderr", content: "x", unexpected: true }] });
  assert.equal(invalid.status, "error");
  assert.equal(invalid.toolIssues[0]?.code, "REQUEST_INVALID");

  const coercibleStream = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: { toString: () => "stderr" }, content: "x" }],
  });
  assert.equal(coercibleStream.status, "error");
  assert.equal(coercibleStream.toolIssues[0]?.code, "REQUEST_INVALID");
});

test("incomplete terminal sequences fail closed as mapping truncation", () => {
  const result = parse(request("Error: truncated before \u001b[31"));
  assert.equal(result.status, "partial");
  assert.equal(result.data.diagnostics[0]?.message, "truncated before ");
  assert.ok(result.truncation.reasons.includes("mapping-failure"));
});

test("redaction masks secrets but preserves benign token metrics", () => {
  const secret = JSON.stringify({ diagnostics: [{ message: "Authorization: Bearer EXAMPLE_TOKEN_VALUE", severity: "error" }] });
  const secretResult = parse(request(secret));
  assert.equal(secretResult.data.diagnostics[0]?.message, "Authorization: Bearer [REDACTED]");

  const metrics = JSON.stringify({ diagnostics: [{ message: "inputTokens=42 outputTokens=17 totalTokens=59", severity: "info" }] });
  const metricsResult = parse(request(metrics));
  assert.equal(metricsResult.data.diagnostics[0]?.message, "inputTokens=42 outputTokens=17 totalTokens=59");
});

test("redaction expansion cannot make exported fields exceed contract bounds", () => {
  const expandedMessage = "token=x ".repeat(1000);
  const result = parse(request(JSON.stringify({ diagnostics: [{ message: expandedMessage, severity: "error" }] })));
  assert.equal(result.status, "partial");
  assert.equal(result.data.diagnostics.length, 0);
  assert.equal(result.toolIssues[0]?.code, "STRUCTURED_DIAGNOSTIC_INVALID");

  const producerOutcome = parse({
    schemaVersion: "1",
    artifacts: [],
    producerOutcome: { command: expandedMessage, signal: "token=x ".repeat(10) },
  });
  assert.equal(producerOutcome.status, "complete");
  assert.deepEqual(producerOutcome.producerOutcome, {});
});
