import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../dist/cli.js";
import { createEngine, discoverTests, execute, planTestScope } from "../dist/index.js";
import { readBoundedText } from "../dist/core/bounded-reader.js";
import { canonicalizeRoot, normalizeRepositoryPath, resolveExistingInsideRoot } from "../dist/core/paths.js";

function rootFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-test-scope-edge-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify(options.packageJson ?? { type: "module", scripts: { test: "node --test", typecheck: "tsc --noEmit", build: "tsc -p tsconfig.json", verify: "npm test" } }), "utf8");
  writeFileSync(join(root, "src", "service.ts"), "export const service = (value: string) => value;\n", "utf8");
  writeFileSync(join(root, "tests", "service.test.ts"), "import { service } from '../src/service.js';\nvoid service;\n", "utf8");
  return root;
}

function capture(args, root) {
  const output = { stdout: "", stderr: "" };
  const code = main(args.map(value => value === "$ROOT" ? root : value), undefined, {
    stdout: { write: chunk => { output.stdout += chunk; } },
    stderr: { write: chunk => { output.stderr += chunk; } }
  });
  const json = output.stdout.trimStart().startsWith("{") ? JSON.parse(output.stdout) : undefined;
  return { code, output, result: json };
}

test("path helpers enforce canonical roots and bounded reads", () => {
  const root = rootFixture();
  try {
    const canonical = canonicalizeRoot(root);
    assert.ok("value" in canonical);
    assert.equal(normalizeRepositoryPath(canonical.value, "src\\service.ts", "changed.path").value, "src/service.ts");
    assert.equal(resolveExistingInsideRoot(canonical.value, "src/service.ts", "path").value?.relative, "src/service.ts");
    assert.equal(resolveExistingInsideRoot(canonical.value, "src", "path").diagnostic.code, "INVALID_REQUEST");
    assert.equal(resolveExistingInsideRoot(canonical.value, "missing.ts", "path").diagnostic.code, "INVALID_REQUEST");
    assert.equal(normalizeRepositoryPath(canonical.value, "../outside.ts", "changed.path").diagnostic.code, "PATH_OUTSIDE_ROOT");
    assert.equal(normalizeRepositoryPath(canonical.value, "", "changed.path").diagnostic.code, "INVALID_REQUEST");
    assert.deepEqual(readBoundedText(join(root, "src", "service.ts"), 1), { reason: "size", bytes: 0 });
    assert.deepEqual(readBoundedText(join(root, "missing.ts"), 1), { reason: "unavailable", bytes: 0 });
    assert.equal(existsSync(join(root, "src", "service.ts")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unsupported, secret, deleted, renamed, and symlink changes are explicit", () => {
  const root = rootFixture();
  try {
    writeFileSync(join(root, ".env"), "secret", "utf8");
    try { symlinkSync(join(root, "src", "service.ts"), join(root, "src", "link.ts")); } catch { /* platform may deny symlinks */ }
    const unsupported = planTestScope({ root, changed: ["README.md"] });
    assert.equal(unsupported.status, "partial");
    assert.ok(unsupported.diagnostics.some(item => item.code === "CHANGE_NOT_SUPPORTED"));
    const secret = planTestScope({ root, changed: [".env"] });
    assert.equal(secret.status, "partial");
    assert.ok(secret.diagnostics.some(item => item.code === "CHANGE_NOT_SUPPORTED"));
    const deleted = planTestScope({ root, changed: [{ path: "src/deleted.ts", status: "deleted" }] });
    assert.equal(deleted.data.plan?.changes[0]?.exists, false);
    const renamed = planTestScope({ root, changed: [{ path: "src/service-new.ts", status: "renamed", oldPath: "src/service.ts" }] });
    assert.equal(renamed.data.plan?.changes[0]?.oldPath, "src/service.ts");
    if (existsSync(join(root, "src", "link.ts")) && lstatSync(join(root, "src", "link.ts")).isSymbolicLink()) {
      const linked = planTestScope({ root, changed: ["src/link.ts"] });
      assert.equal(linked.status, "error");
      assert.equal(linked.diagnostics[0]?.code, "PATH_OUTSIDE_ROOT");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("external evidence and configuration signals change bounded risk", () => {
  const root = rootFixture();
  try {
    const symbol = planTestScope({ root, changed: ["src/service.ts"], symbolEvidence: { schemaVersion: "1", data: { matches: [{ path: "src/service.ts", exported: true }] } } });
    assert.ok(symbol.data.plan?.risk.signals.some(item => item.code === "external-symbol-evidence"));
    assert.notEqual(symbol.data.plan?.risk.level, "low");
    const impact = planTestScope({ root, changed: ["src/service.ts"], impactEvidence: { schemaVersion: "0.1-draft", ok: true, impact: { direct: ["consumer"] } } });
    assert.equal(impact.data.plan?.risk.level, "high");
    const unavailable = planTestScope({ root, changed: ["src/service.ts"], impactEvidence: { schemaVersion: "0.1-draft", ok: false } });
    assert.equal(unavailable.status, "partial");
    assert.ok(unavailable.diagnostics.some(item => item.code === "IMPACT_EVIDENCE_UNAVAILABLE"));
    writeFileSync(join(root, "tsconfig.json"), "{}", "utf8");
    writeFileSync(join(root, "tsconfig.test.json"), "{}", "utf8");
    const ambiguous = discoverTests({ root });
    assert.equal(ambiguous.status, "partial");
    assert.ok(ambiguous.diagnostics.some(item => item.code === "PROJECT_CONFIG_AMBIGUOUS"));
    const limited = createEngine({ limits: { maxSingleFileBytes: 1 } }).execute({ operation: "discover", root });
    assert.equal(limited.status, "partial");
    assert.ok(limited.diagnostics.some(item => item.code === "RESOURCE_LIMIT"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validation and CLI parse failures remain structured", () => {
  const root = rootFixture();
  try {
    for (const request of [null, {}, { operation: "unknown", root }, { operation: "plan", root, changed: [] }, { operation: "plan", root, changed: ["src/service.ts"], include: [""] }, { operation: "explain", root, changed: ["src/service.ts"], target: { path: "x", command: "y" } }]) {
      const result = execute(request);
      assert.equal(result.status, "error");
      assert.ok(result.diagnostics.some(item => item.code === "INVALID_REQUEST"));
    }
    assert.equal(capture(["--help"], root).code, 0);
    assert.equal(capture(["discover", "--root", "$ROOT", "--include=src/**/*.ts"], root).code, 0);
    assert.equal(capture(["discover", "--root", "$ROOT", "--root", "$ROOT"], root).code, 2);
    assert.equal(capture(["discover", "--root", "$ROOT", "--unknown", "x"], root).code, 2);
    assert.equal(capture(["discover", "--root", "$ROOT", "positional"], root).code, 2);
    assert.equal(capture(["discover", "--root"], root).code, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
