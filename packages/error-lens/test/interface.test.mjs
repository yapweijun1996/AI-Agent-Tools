import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { capabilities, parse } from "../dist/src/index.js";
import { readUtf8Stream } from "../dist/src/core/cli-input.js";
import { serializeCapabilities, serializeResult } from "../dist/src/core/serialize.js";

test("duplicate identities are deduplicated with a deterministic evidence union", () => {
  const content = [
    "src/order.ts(41,18): error TS2339: Property total does not exist",
    "src/order.ts(41,18): error TS2339: Property total does not exist",
  ].join("\n");
  const result = parse({ schemaVersion: "1", artifacts: [{ id: "stderr", stream: "stderr", content }] });

  assert.equal(result.data.diagnostics.length, 1);
  assert.equal(result.data.diagnostics[0]?.evidence.length, 2);
  assert.equal(result.data.summary.diagnosticCount, 1);
  assert.equal(result.stats.diagnosticsBeforeLimit, 2);
  assert.ok(result.data.diagnostics[0]?.evidence[0].start < result.data.diagnostics[0]?.evidence[1].start);
});

test("canonical serialization normalizes strings and preserves schema key order", () => {
  const result = parse({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: JSON.stringify({ diagnostics: [{ message: "Café", severity: "error" }] }) }],
  });
  const serialized = serializeResult(result);
  const parsed = JSON.parse(serialized);

  assert.equal(parsed.data.diagnostics[0].message, "Café");
  assert.deepEqual(Object.keys(parsed), ["schemaVersion", "status", "data", "toolIssues", "warnings", "truncation", "stats"]);
  assert.deepEqual(Object.keys(parsed.data.diagnostics[0]), ["id", "severity", "phase", "message", "code", "location", "producerId", "confidence", "evidence"]);
  assert.equal(serialized.endsWith("\n"), true);
  assert.equal(serialized.includes("\n\n"), false);
});

test("CLI and library emit byte-identical canonical results with independent exit semantics", () => {
  const completeRequest = {
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: "src/order.ts(41,18): error TS2339: Property total does not exist\n" }],
    producerOutcome: { command: "npm test", exitCode: 1 },
  };
  const completeResult = parse(completeRequest);
  const actualCompleteRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify(completeRequest),
  });
  assert.equal(actualCompleteRun.status, 0);
  assert.equal(actualCompleteRun.stderr, "");
  assert.equal(actualCompleteRun.stdout, serializeResult(completeResult));
  assert.equal(completeResult.status, "complete");
  const repeatedCompleteRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify(completeRequest),
  });
  assert.equal(repeatedCompleteRun.status, 0);
  assert.equal(repeatedCompleteRun.stdout, actualCompleteRun.stdout);

  const partialRequest = { schemaVersion: "1", artifacts: [{ id: "stderr", stream: "stderr", content: "unrecognized output" }] };
  const partialResult = parse(partialRequest);
  const partialRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify(partialRequest),
  });
  assert.equal(partialRun.status, 0);
  assert.equal(partialRun.stdout, serializeResult(partialResult));
  assert.equal(partialResult.status, "partial");

  const errorRequest = { schemaVersion: "1", artifacts: [{ id: "stderr", stream: "stderr", content: "x", unexpected: true }] };
  const errorResult = parse(errorRequest);
  const errorRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify(errorRequest),
  });
  assert.equal(errorRun.status, 1);
  assert.equal(errorRun.stdout, serializeResult(errorResult));
  assert.equal(errorResult.status, "error");
});

test("CLI usage errors exit 2 and capabilities use the same serializer", () => {
  const usageRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json", "--unknown"], {
    encoding: "utf8",
    input: JSON.stringify({ schemaVersion: "1", artifacts: [] }),
  });
  assert.equal(usageRun.status, 2);
  assert.equal(usageRun.stdout, "");
  assert.match(usageRun.stderr, /Usage: agent-error-lens/u);

  const capabilitiesRun = spawnSync(process.execPath, ["dist/src/cli.js", "capabilities", "--format", "json"], { encoding: "utf8" });
  assert.equal(capabilitiesRun.status, 0);
  assert.equal(capabilitiesRun.stderr, "");
  assert.equal(capabilitiesRun.stdout, serializeCapabilities(capabilities()));
});

test("CLI root injection does not hide malformed request options", () => {
  for (const options of [null, 5, { root: "" }, { root: 5 }]) {
    const run = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json", "--root", "/workspace/project"], {
      encoding: "utf8",
      input: JSON.stringify({ schemaVersion: "1", artifacts: [], options }),
    });
    assert.equal(run.status, 1);
    assert.equal(run.stderr, "");
    assert.equal(JSON.parse(run.stdout).toolIssues[0]?.code, "REQUEST_INVALID");
  }
});

test("CLI input is bounded and rejects invalid UTF-8 before JSON parsing", async () => {
  const oversized = await readUtf8Stream((async function* () {
    yield Buffer.from("abc");
    yield Buffer.from("d");
  }()), 3);
  assert.equal(oversized.ok, false);
  assert.equal(oversized.code, "CLI_INPUT_TOO_LARGE");

  const splitUtf8 = await readUtf8Stream((async function* () {
    yield Buffer.from([0xe2]);
    yield Buffer.from([0x82, 0xac]);
  }()));
  assert.deepEqual(splitUtf8, { ok: true, text: "€", bytes: 3 });

  const invalidUtf8Run = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: Buffer.from([0xff]),
  });
  assert.equal(invalidUtf8Run.status, 2);
  assert.equal(invalidUtf8Run.stdout, "");
  assert.match(invalidUtf8Run.stderr, /stdin must contain valid UTF-8/u);
});
