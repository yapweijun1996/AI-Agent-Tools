import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { capabilities, parse } from "../dist/src/index.js";

test("library exposes the frozen capabilities contract", () => {
  assert.deepEqual(capabilities(), {
    schemaVersion: "1",
    operations: ["parse", "capabilities"],
    producers: ["typescript", "vitest", "eslint", "generic-structured", "generic-text"],
  });
});

test("library parse returns a complete result for an empty valid request", () => {
  const result = parse({ schemaVersion: "1", artifacts: [] });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.toolIssues, []);
});

test("CLI capabilities and parse use the shared entry points", () => {
  const capabilitiesRun = spawnSync(process.execPath, ["dist/src/cli.js", "capabilities", "--format", "json"], {
    encoding: "utf8",
  });
  assert.equal(capabilitiesRun.status, 0);
  assert.equal(capabilitiesRun.stderr, "");
  assert.deepEqual(JSON.parse(capabilitiesRun.stdout), capabilities());

  const parseRun = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify({ schemaVersion: "1", artifacts: [] }),
  });
  assert.equal(parseRun.status, 0);
  assert.equal(parseRun.stderr, "");
  assert.equal(JSON.parse(parseRun.stdout).status, "complete");
});
