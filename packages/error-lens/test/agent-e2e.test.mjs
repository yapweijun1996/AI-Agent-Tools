import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

function locateForAgent(result) {
  const diagnostic = result.data.diagnostics.find((item) => item.confidence === "confirmed" && item.location !== null);
  if (!diagnostic) return null;
  const evidence = diagnostic.evidence[0];
  if (!evidence) return null;
  return {
    file: diagnostic.location.file,
    line: diagnostic.location.line,
    column: diagnostic.location.column,
    rawSpan: evidence,
  };
}

test("CLI output supports a downstream agent locator and raw evidence handoff", () => {
  const request = {
    schemaVersion: "1",
    artifacts: [{
      id: "stderr",
      stream: "stderr",
      content: "src/services/order.ts(81,14): error TS2339: Property 'total' does not exist on type 'Order'\n",
    }],
  };
  const run = spawnSync(process.execPath, ["dist/src/cli.js", "parse", "--stdin", "--format", "json"], {
    encoding: "utf8",
    input: JSON.stringify(request),
  });
  assert.equal(run.status, 0);
  assert.equal(run.stderr, "");

  const result = JSON.parse(run.stdout);
  const handoff = locateForAgent(result);
  assert.deepEqual(handoff && { file: handoff.file, line: handoff.line, column: handoff.column }, {
    file: "src/services/order.ts",
    line: 81,
    column: 14,
  });
  assert.equal(request.artifacts[0].content.slice(handoff.rawSpan.start, handoff.rawSpan.end), request.artifacts[0].content.trimEnd());
});
