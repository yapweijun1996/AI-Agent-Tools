const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");

test("global and operation help do not require a repository or project", () => {
  const cli = join(__dirname, "../dist/cli.js");
  for (const args of [["--help"], ["-h"], ["file", "--help"], ["capabilities", "-h"]]) {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: tmpdir(), encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Usage: agent-impact/);
    assert.match(result.stdout, /--project tsconfig.json/);
    assert.equal(result.stderr, "");
  }
  const invalid = spawnSync(process.execPath, [cli, "unknown", "--help"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.equal(JSON.parse(invalid.stdout).ok, false);
});
