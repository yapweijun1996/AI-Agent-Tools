import test from "node:test";
import assert from "node:assert/strict";
import {
  checkEnvironment,
  collectSnapshot,
  validateRequirements,
  validateSnapshot,
  encodeResult,
  readJson,
} from "../src/index.js";
import { runCli } from "../src/cli.js";
const req = {
  schemaVersion: "1.0",
  runtimes: { node: "^22 || ^24" },
  configuration: ["TOKEN"],
};
for (const [version, status] of [
  ["22.23.3", "pass"],
  ["24.0.0", "pass"],
  ["23.10.0", "fail"],
  ["not-a-version", "unknown"],
])
  test("actual version " + version, () =>
    assert.equal(
      checkEnvironment(req, {
        schemaVersion: "1.0",
        runtimes: { node: { available: true, version, path: "/node@22" } },
        configuration: { TOKEN: true },
      }).status,
      status,
    ),
  );
test("missing evidence unknown", () =>
  assert.equal(
    checkEnvironment(req, { schemaVersion: "1.0" }).status,
    "unknown",
  ));
test("empty requirements unknown", () =>
  assert.equal(
    checkEnvironment({ schemaVersion: "1.0" }, { schemaVersion: "1.0" })
      .complete,
    false,
  ));
test("configuration values rejected", () =>
  assert.throws(() =>
    validateSnapshot({
      schemaVersion: "1.0",
      configuration: { TOKEN: "secret" },
    }),
  ));
test("invalid ranges rejected", () =>
  assert.throws(() =>
    validateRequirements({
      schemaVersion: "1.0",
      runtimes: { node: "banana" },
    }),
  ));
test("unknown runtime rejected", () =>
  assert.throws(() =>
    validateRequirements({ schemaVersion: "1.0", runtimes: { ruby: null } }),
  ));
test("source pointers use original ordering", () => {
  const r = checkEnvironment(
    { schemaVersion: "1.0", configuration: ["Z", "A"] },
    { schemaVersion: "1.0", configuration: { A: true, Z: true } },
  );
  assert.equal(r.data.checks[0].evidence.pointer, "/configuration/1");
});
test("live Node uses process version", () =>
  assert.equal(
    collectSnapshot({ schemaVersion: "1.0", runtimes: { node: null } }).runtimes
      .node.version,
    process.versions.node,
  ));
test("live config only presence, no values", () => {
  const result = collectSnapshot(
    { schemaVersion: "1.0", configuration: ["TOKEN"] },
    { env: { TOKEN: "sk-proj-secret123456" } },
  );
  assert.equal(result.configuration.TOKEN, true);
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("unicode and Windows paths supported offline", () => {
  const r = checkEnvironment(
    {
      schemaVersion: "1.0",
      paths: [{ id: "p", path: "C:\\用户\\资料", permissions: ["read"] }],
    },
    { schemaVersion: "1.0", paths: { p: { read: true } } },
  );
  assert.equal(r.status, "pass");
});
test("redact provider token in source path", () =>
  assert.ok(
    !JSON.stringify(
      checkEnvironment(
        { schemaVersion: "1.0" },
        { schemaVersion: "1.0" },
        { requirementsSource: "sk-proj-secret123456" },
      ),
    ).includes("secret123456"),
  ));
test("output bound", () =>
  assert.equal(
    JSON.parse(encodeResult({ x: "a".repeat(70000) })).status,
    "unknown",
  ));
test("credential file blocked", () => assert.throws(() => readJson(".env")));
test("CLI bad input stable JSON and exit", () => {
  const r = runCli(["check", "--json"]);
  assert.equal(r.code, 2);
  assert.equal(JSON.parse(r.stdout).status, "error");
});
test("caps", () => assert.equal(runCli(["capabilities", "--json"]).code, 0));
test("fail plus missing evidence incomplete", () => {
  const r = checkEnvironment(req, {
    schemaVersion: "1.0",
    runtimes: { node: { available: false } },
  });
  assert.equal(r.status, "fail");
  assert.equal(r.complete, false);
});
test("manifest engines independently checked", () => {
  const r = checkEnvironment(
    { schemaVersion: "1.0", runtimes: { node: "*" } },
    {
      schemaVersion: "1.0",
      runtimes: { node: { available: true, version: "22.23.3" } },
    },
    { manifest: { engines: { node: "^24" } } },
  );
  assert.equal(r.status, "fail");
  assert.equal(r.data.checks.length, 2);
});
test("stable ordering independent runtime/config order", () => {
  const snapshot = {
    schemaVersion: "1.0",
    runtimes: {
      node: { available: true, version: "22.23.3" },
      npm: { available: true, version: "10.0.0" },
    },
  };
  assert.deepEqual(
    checkEnvironment(
      { schemaVersion: "1.0", runtimes: { node: "*", npm: "*" } },
      snapshot,
    ),
    checkEnvironment(
      { schemaVersion: "1.0", runtimes: { npm: "*", node: "*" } },
      snapshot,
    ),
  );
});
test("requirement budget", () =>
  assert.throws(() =>
    validateRequirements({
      schemaVersion: "1.0",
      configuration: Array.from({ length: 129 }, (_, i) => "VAR_" + i),
    }),
  ));
test("unprobed paths remain unknown", () =>
  assert.equal(
    checkEnvironment(
      {
        schemaVersion: "1.0",
        paths: [{ id: "x", path: ".", permissions: ["write"] }],
      },
      collectSnapshot({ schemaVersion: "1.0" }),
    ).status,
    "unknown",
  ));
