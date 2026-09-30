import assert from "node:assert/strict";
import { test } from "node:test";

import { parse } from "../dist/src/index.js";

const request = (content, id = "stderr") => ({
  schemaVersion: "1",
  artifacts: [{ id, stream: "stderr", content }],
});

test("artifact and aggregate request byte ceilings fail closed", () => {
  const artifactLimit = parse(request("x".repeat(2 * 1024 * 1024 + 1)));
  assert.equal(artifactLimit.status, "error");
  assert.equal(artifactLimit.toolIssues[0]?.code, "ARTIFACT_BYTES_EXCEEDED");

  const content = "x".repeat(2 * 1024 * 1024);
  const aggregateLimit = parse({
    schemaVersion: "1",
    artifacts: Array.from({ length: 11 }, (_, index) => ({ id: `artifact-${index}`, stream: "stderr", content })),
  });
  assert.equal(aggregateLimit.status, "error");
  assert.equal(aggregateLimit.toolIssues[0]?.code, "REQUEST_BYTES_EXCEEDED");
});

test("normalization and parser work budgets expose deterministic truncation", () => {
  const terminalLimit = parse(request("\u001b[31m".repeat(10_001)));
  assert.equal(terminalLimit.status, "partial");
  assert.ok(terminalLimit.truncation.reasons.includes("terminal-sequences"));
  assert.equal(terminalLimit.stats.terminalSequences, 10_000);

  const lineLimit = parse(request(`${"x\n".repeat(200_001)}`));
  assert.equal(lineLimit.status, "partial");
  assert.ok(lineLimit.truncation.reasons.includes("processed-lines"));
  assert.equal(lineLimit.stats.linesProcessed, 200_000);

  const parserLimit = parse(request(`${"src/item.ts(1,1): error TS7006: repeated\n".repeat(10_001)}`));
  assert.equal(parserLimit.status, "partial");
  assert.ok(parserLimit.truncation.reasons.includes("parser-matches"));
  assert.equal(parserLimit.stats.parserMatches, 10_000);
  assert.equal(parserLimit.data.diagnostics.length, 1);
});

test("evidence span budget stays bounded and explicit", () => {
  const records = Array.from({ length: 6 }, () => `  {"message":"${"x".repeat(13 * 1024)}","severity":"error"}`);
  const content = `{"diagnostics":[\n${records.join(",\n")}\n]}\n`;
  const result = parse(request(content));
  assert.equal(result.status, "partial");
  assert.equal(result.toolIssues[0]?.code, "EVIDENCE_SPAN_LIMIT");
  assert.ok(result.truncation.reasons.includes("evidence-bytes"));
  assert.equal(result.data.diagnostics.length, 0);
});

test("aggregate evidence budget stops export without unbounded growth", () => {
  const artifacts = Array.from({ length: 64 }, (_, index) => {
    const linePrefix = `ERROR at src/item-${index}.ts:1:1 `;
    const line = `${linePrefix}${"x".repeat(16_384 - linePrefix.length)}`;
    return { id: `artifact-${index}`, stream: "stderr", content: `${line}\n${line}\n` };
  });
  const result = parse({ schemaVersion: "1", artifacts });

  assert.equal(result.status, "partial");
  assert.ok(result.truncation.reasons.includes("evidence-bytes"));
  assert.ok(result.stats.evidenceBytes <= 1024 * 1024);
});
