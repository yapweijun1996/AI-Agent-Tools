import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  verifyDeployment,
  validateBundle,
  encodeResult,
  capabilities,
} from "../src/index.js";
import { runCli } from "../src/cli.js";
import Ajv from "ajv";
const fixture = JSON.parse(
  readFileSync(new URL("../examples/server-pass.json", import.meta.url)),
);
const fresh = () => structuredClone(fixture);
const status = (edit) => {
  const x = fresh();
  edit(x);
  return verifyDeployment(x);
};
test("server match scoped and installed device unknown", () => {
  const r = verifyDeployment(fresh());
  assert.equal(r.status, "pass");
  assert.equal(r.data.installedDeviceUpdate, "unknown");
  assert.equal(r.data.scope, "supplied-server-evidence");
});
test("browser match still not installed device proof", () => {
  const r = verifyDeployment(
    JSON.parse(
      readFileSync(new URL("../examples/browser-pass.json", import.meta.url)),
    ),
  );
  assert.equal(r.status, "pass");
  assert.equal(r.data.installedDeviceUpdate, "unknown");
});
for (const [name, edit, want] of [
  ["wrong CI commit", (x) => (x.ci[0].commit = "c".repeat(40)), "fail"],
  ["wrong CI build", (x) => (x.ci[0].buildId = "old"), "fail"],
  ["failed CI", (x) => (x.ci[0].conclusion = "fail"), "fail"],
  ["pending CI", (x) => (x.ci[0].conclusion = "pending"), "unknown"],
  ["missing CI", (x) => delete x.ci, "unknown"],
  ["missing HTTP", (x) => delete x.http, "unknown"],
  ["missing hash", (x) => delete x.http[0].sha256, "unknown"],
  ["wrong hash", (x) => (x.http[0].sha256 = "c".repeat(64)), "fail"],
  ["missing version", (x) => delete x.http[0].buildId, "unknown"],
  ["HTTP500", (x) => (x.http[0].status = 500), "fail"],
  [
    "304 no cached entity",
    (x) => {
      x.http[0].status = 304;
      delete x.http[0].sha256;
    },
    "unknown",
  ],
  [
    "304 supplied cached entity",
    (x) => {
      x.http[0].status = 304;
      x.http[0].cache = {
        source: "browser-cache",
        buildId: x.expected.buildId,
      };
    },
    "pass",
  ],
  [
    "stale HTTP",
    (x) => (x.http[0].observedAt = "2026-09-29T11:00:00Z"),
    "unknown",
  ],
  [
    "future HTTP",
    (x) => (x.http[0].observedAt = "2026-10-01T12:00:00Z"),
    "unknown",
  ],
  ["stale CI", (x) => (x.ci[0].observedAt = "2026-09-29T12:00:00Z"), "unknown"],
  [
    "cached old build",
    (x) => (x.http[0].cache = { source: "service-worker", buildId: "old" }),
    "fail",
  ],
  ["cached age too old", (x) => (x.http[0].cache.ageSeconds = 5000), "unknown"],
  [
    "unknown cache source",
    (x) => (x.http[0].cache.source = "unknown"),
    "unknown",
  ],
  [
    "external redirect",
    (x) =>
      (x.http[0].redirects = [
        { status: 302, url: "https://other.invalid/app.js" },
      ]),
    "fail",
  ],
  [
    "same origin redirect",
    (x) =>
      (x.http[0].redirects = [
        { status: 302, url: "https://example.invalid/app.js" },
      ]),
    "pass",
  ],
  ["redirect without final body", (x) => (x.http[0].status = 302), "unknown"],
  [
    "wrong final path",
    (x) => (x.http[0].finalUrl = "https://example.invalid/login"),
    "fail",
  ],
  [
    "required browser missing",
    (x) => (x.policy.requireBrowser = true),
    "unknown",
  ],
])
  test(name, () => assert.equal(status(edit).status, want));
test("retry supersedes failed CI", () =>
  assert.equal(
    status(
      (x) =>
        x.ci.push({
          ...x.ci[0],
          id: "later",
          observedAt: "2026-09-30T11:59:00Z",
          conclusion: "pass",
        }) && (x.ci[0].conclusion = "fail"),
    ).status,
    "pass",
  ));
test("conflicting same instant CI unknown", () =>
  assert.equal(
    status((x) => x.ci.push({ ...x.ci[0], id: "other", conclusion: "fail" }))
      .status,
    "unknown",
  ));
test("conflicting same instant HTTP unknown", () =>
  assert.equal(
    status((x) =>
      x.http.push({ ...x.http[0], id: "other", sha256: "c".repeat(64) }),
    ).status,
    "unknown",
  ));
test("stale failed retry not replaced by older success", () =>
  assert.equal(
    status((x) =>
      x.ci.push({
        ...x.ci[0],
        id: "future",
        observedAt: "2026-10-01T12:00:00Z",
        conclusion: "fail",
      }),
    ).status,
    "unknown",
  ));
test("identical duplicate observations deduplicated", () =>
  assert.equal(status((x) => x.http.push({ ...x.http[0] })).status, "pass"));
for (const [name, edit] of [
  ["unknown command", (x) => (x.commands = ["rm -rf /"])],
  ["bad version", (x) => (x.schemaVersion = "2")],
  ["bad timestamp", (x) => (x.policy.asOf = "2026-02-30T12:00:00Z")],
  [
    "url credentials",
    (x) => (x.http[0].finalUrl = "https://user:secret@example.invalid/app.js"),
  ],
  ["url query token", (x) => (x.http[0].finalUrl += "?token=secret")],
  ["url fragment", (x) => (x.http[0].finalUrl += "#secret")],
  ["path traversal", (x) => (x.expected.assets[0].path = "/../x")],
  ["encoded traversal", (x) => (x.expected.assets[0].path = "/%2e%2e/x")],
  ["empty assets", (x) => (x.expected.assets = [])],
  ["empty CI policy", (x) => (x.policy.requiredChecks = [])],
  [
    "duplicate conflicting id",
    (x) => x.http.push({ ...x.http[0], status: 500 }),
  ],
  [
    "excess redirects",
    (x) =>
      (x.http[0].redirects = Array.from({ length: 6 }, () => ({
        status: 301,
        url: "https://example.invalid/app.js",
      }))),
  ],
])
  test("reject " + name, () => {
    const x = fresh();
    edit(x);
    assert.throws(() => validateBundle(x));
  });
test("Unicode canonical encoded path", () =>
  assert.equal(
    status((x) => {
      x.expected.assets[0].path = "/%E7%94%A8%E6%88%B7.js";
      x.http[0].assetPath = x.expected.assets[0].path;
      x.http[0].finalUrl = x.expected.origin + x.http[0].assetPath;
    }).status,
    "pass",
  ));
test("browser stale unknown", () => {
  const x = JSON.parse(
    readFileSync(new URL("../examples/browser-pass.json", import.meta.url)),
  );
  x.browser.observedAt = "2026-09-29T12:00:00Z";
  assert.equal(verifyDeployment(x).status, "unknown");
});
test("browser worker mismatch", () => {
  const x = JSON.parse(
    readFileSync(new URL("../examples/browser-pass.json", import.meta.url)),
  );
  x.browser.serviceWorkerBuildId = "old";
  assert.equal(verifyDeployment(x).status, "fail");
});
test("browser missing asset evidence unknown", () => {
  const x = JSON.parse(
    readFileSync(new URL("../examples/browser-pass.json", import.meta.url)),
  );
  delete x.browser.assets;
  assert.equal(verifyDeployment(x).status, "unknown");
});
test("failure plus unknown incomplete", () => {
  const r = status((x) => {
    x.ci[0].conclusion = "fail";
    delete x.http;
  });
  assert.equal(r.status, "fail");
  assert.equal(r.complete, false);
});
test("provenance identifies input and pointers", () => {
  const r = verifyDeployment(fresh());
  assert.match(r.data.checks[0].evidence.artifactSha256, /^[a-f0-9]{64}$/);
  assert.ok(r.data.checks[0].evidence.pointers[0].startsWith("/ci/"));
});
test("object key order deterministic", () => {
  const x = fresh(),
    y = Object.fromEntries(Object.entries(x).reverse());
  assert.deepEqual(verifyDeployment(x), verifyDeployment(y));
});
test("bounded output", () =>
  assert.equal(
    JSON.parse(encodeResult({ payload: "x".repeat(70000) })).status,
    "unknown",
  ));
test("CLI error redacts supplied text", () => {
  const r = runCli([
    "deploy-verify",
    "--input",
    "sk-proj-supersecret-value",
    "--json",
  ]);
  assert.equal(r.code, 2);
  assert.ok(!r.stdout.includes("supersecret"));
});
test("result schema validates operations", () => {
  const validate = new Ajv().compile(
    JSON.parse(
      readFileSync(new URL("../schema/result.schema.json", import.meta.url)),
    ),
  );
  for (const r of [capabilities(), verifyDeployment(fresh())])
    assert.equal(validate(r), true, JSON.stringify(validate.errors));
});
test("cache evidence absent remains unknown", () =>
  assert.equal(status((x) => delete x.http[0].cache).status, "unknown"));
test("ordinary browser snapshot needs no worker claim", () => {
  const x = JSON.parse(
    readFileSync(new URL("../examples/browser-pass.json", import.meta.url)),
  );
  x.policy.requireServiceWorker = false;
  delete x.browser.controlled;
  delete x.browser.serviceWorkerBuildId;
  assert.equal(verifyDeployment(x).status, "pass");
});
test("worker evidence explicitly required without browser remains unknown", () =>
  assert.equal(
    status((x) => (x.policy.requireServiceWorker = true)).status,
    "unknown",
  ));
test("input schema validates documented fixtures", () => {
  const validate = new Ajv().compile(
    JSON.parse(
      readFileSync(new URL("../schema/input.schema.json", import.meta.url)),
    ),
  );
  for (const file of ["server-pass", "browser-pass"])
    assert.equal(
      validate(
        JSON.parse(
          readFileSync(
            new URL("../examples/" + file + ".json", import.meta.url),
          ),
        ),
      ),
      true,
      JSON.stringify(validate.errors),
    );
});
