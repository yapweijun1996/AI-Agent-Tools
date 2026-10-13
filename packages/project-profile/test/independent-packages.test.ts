import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { profileRepository } from "../src/index.js";
import { BUDGETS } from "../src/constants.js";
import { validateProfileSemantics } from "../src/core/semantic.js";
import { hashTree, runCli, validateWithSchema, writeFile } from "./helpers.js";

function createRepository(declaration?: unknown): { root: string; dispose: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "profile-independent-"));
  writeFile(root, "package.json", JSON.stringify({
    name: "independent-root",
    packageManager: "npm@10.0.0",
    ...(declaration === undefined ? {} : { agentProjectProfile: declaration }),
  }));
  return { root, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("explicit independent packages retain isolated managers, native commands and runtimes without executing scripts", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    const expectedPaths: string[] = [];
    for (let index = 0; index < 18; index += 1) {
      const cwd = `packages/p${String(index).padStart(2, "0")}`;
      expectedPaths.push(cwd);
      const manager = ["npm", "pnpm", "yarn"][index % 3]!;
      writeFile(temporary.root, `${cwd}/package.json`, JSON.stringify({
        name: `independent-${index}`,
        packageManager: `${manager}@10.0.0`,
        engines: { node: ">=22" },
        scripts: { build: "node must-not-run.cjs", test: "node must-not-run.cjs", "test:unit": "node must-not-run.cjs" },
      }));
      writeFile(temporary.root, `${cwd}/must-not-run.cjs`, "require('node:fs').writeFileSync('executed.txt', 'unsafe');\n");
    }
    const before = hashTree(temporary.root);
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    assert.equal(profile.status, "complete");
    assert.equal(profile.project.kind, "monorepo");
    assert.equal(profile.workspace.enabled, false);
    assert.deepEqual(profile.workspace.packages, []);
    assert.equal(profile.workspace.truncated, false);
    assert.equal(profile.packageInventory?.kind, "independent");
    assert.equal(profile.packageInventory?.total, 18);
    assert.equal(profile.packageInventory?.returned, 18);
    assert.equal(profile.packageInventory?.truncated, false);
    assert.deepEqual(profile.packageInventory?.packages.map((member) => member.path), expectedPaths);
    assert.equal(profile.coverage.categories.packageInventory, "complete");
    assert.equal(profile.coverage.truncated.packageInventory, false);
    const declaration = profile.packageInventory!.declarations[0]!;
    assert.equal(declaration.pointer, "/agentProjectProfile/independentPackages");
    assert(profile.evidence.some((record) => declaration.evidence.includes(record.id) && record.path === "package.json" && record.pointer === declaration.pointer));
    for (const member of profile.packageInventory!.packages) {
      assert.notEqual(member.packageManager.inherited, true);
      const command = profile.commands.test.find((record) => record.cwd === member.path && record.script === "test");
      assert(command);
      assert.deepEqual(command.argv, [member.packageManager.name, "run", "test"]);
      assert.equal(command.execution, "not_run");
      assert.equal(command.declaredByProject, true);
      assert(profile.evidence.some((record) => command.evidence.includes(record.id) && record.path === `${member.path}/package.json` && record.pointer === "/scripts/test"));
      assert(profile.runtimes.some((record) => record.cwd === member.path && record.value === ">=22"));
    }
    const text = runCli(temporary.root, "--format", "text");
    assert.equal(text.status, 0);
    assert(text.stdout.includes("kind: monorepo"));
    assert(text.stdout.includes("workspace: disabled"));
    assert(text.stdout.includes("independent-packages: 18/18"));
    assert(text.stdout.includes("packages/p02: independent-2 (yarn)"));
    assert.equal(hashTree(temporary.root), before);
  } finally { temporary.dispose(); }
});

test("ordinary repositories do not gain inventory fields or implicitly traverse a packages directory", () => {
  const temporary = createRepository();
  try {
    writeFile(temporary.root, "packages/a/package.json", JSON.stringify({ name: "hidden", packageManager: "yarn@4.0.0", scripts: { test: "hidden" } }));
    const accesses: string[] = [];
    const before = profileRepository(temporary.root, { accessObserver: (event) => { accesses.push(event.path); } });
    writeFile(temporary.root, "packages/a/package.json", "malformed metadata must not be read");
    writeFile(temporary.root, "packages/b/package.json", JSON.stringify({ name: "also-hidden" }));
    const after = profileRepository(temporary.root);
    validateWithSchema(before);
    validateWithSchema(after);
    assert.deepEqual(after, before);
    assert.equal(before.project.kind, "single-package");
    assert(!Object.hasOwn(before, "packageInventory"));
    assert(!Object.hasOwn(before.coverage.categories, "packageInventory"));
    assert(!Object.hasOwn(before.coverage.truncated, "packageInventory"));
    assert(!accesses.some((member) => member.startsWith("packages/")));
    assert(!runCli(temporary.root, "--format", "text").stdout.includes("independent-packages:"));
  } finally { temporary.dispose(); }
});

test("malformed, mixed, duplicate and unsafe declarations fail closed with root declaration evidence", () => {
  for (const declaration of [
    null,
    { independentPackages: "packages/*" },
    { independentPackages: [] },
    { independentPackages: ["packages/*", 1] },
    { independentPackages: ["packages/*", "../outside"] },
    { independentPackages: ["/outside"] },
    { independentPackages: ["C:/outside"] },
    { independentPackages: ["packages\\*"] },
    { independentPackages: ["packages/{a,b}"] },
    { independentPackages: ["credentials/*"] },
    { independentPackages: ["packages/*", "packages/./*"] },
    { independentPackages: ["!packages/*"] },
    { independentPackages: ["a/".repeat(BUDGETS.directoryDepth + 1)] },
    { independentPackages: ["a".repeat(BUDGETS.sourceStringBytes + 1)] },
  ]) {
    const temporary = createRepository(declaration);
    try {
      writeFile(temporary.root, "packages/a/package.json", JSON.stringify({ name: "a", packageManager: "npm@10.0.0" }));
      const accesses: string[] = [];
      const profile = profileRepository(temporary.root, { accessObserver: (event) => { accesses.push(event.path); } });
      validateWithSchema(profile);
      assert.equal(profile.status, "partial");
      assert.equal(profile.project.kind, "unknown");
      assert.equal(profile.packageInventory?.returned, 0);
      assert.equal(profile.packageInventory?.total, null);
      assert.equal(profile.packageInventory?.truncated, true);
      assert(!accesses.some((member) => member.startsWith("packages/")));
      const warning = profile.warnings.find((record) => record.code === "PACKAGE_INVENTORY_UNRESOLVED");
      assert(warning && warning.evidence.length > 0);
      assert(profile.evidence.some((record) => warning.evidence.includes(record.id) && record.path === "package.json" && record.pointer?.startsWith("/agentProjectProfile")));
    } finally { temporary.dispose(); }
  }
});

test("conflicting workspace declarations retain native workspace facts but do not scan independent members", () => {
  for (const manager of ["npm", "pnpm", "yarn"]) {
    const temporary = createRepository({ independentPackages: ["independent/*"] });
    try {
      writeFile(temporary.root, "package.json", JSON.stringify({ name: "root", packageManager: `${manager}@10.0.0`, ...(manager === "pnpm" ? {} : { workspaces: ["workspace/*"] }), agentProjectProfile: { independentPackages: ["independent/*"] } }));
      if (manager === "pnpm") writeFile(temporary.root, "pnpm-workspace.yaml", "packages:\n  - 'workspace/*'\n");
      writeFile(temporary.root, "workspace/a/package.json", JSON.stringify({ name: "workspace-a", scripts: { test: "declared-only" } }));
      writeFile(temporary.root, "independent/a/package.json", JSON.stringify({ name: "independent-a" }));
      const accesses: string[] = [];
      const profile = profileRepository(temporary.root, { accessObserver: (event) => { accesses.push(event.path); } });
      validateWithSchema(profile);
      assert.equal(profile.status, "partial");
      assert.equal(profile.project.kind, "workspace");
      assert.equal(profile.workspace.enabled, true);
      assert.equal(profile.workspace.returned, 1);
      assert.equal(profile.workspace.packages[0]?.packageManager.inherited, true);
      assert.deepEqual(profile.commands.test[0]?.argv, [manager, "run", "test"]);
      assert.equal(profile.packageInventory?.returned, 0);
      assert.equal(profile.packageInventory?.total, null);
      assert(!accesses.some((member) => member.startsWith("independent/")));
      assert(profile.warnings.some((record) => record.code === "PACKAGE_INVENTORY_UNRESOLVED" && record.evidence.length >= 2));
    } finally { temporary.dispose(); }
  }
});

test("independent managers are never inherited and local lockfiles determine native invocations", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    writeFile(temporary.root, "packages/a/package.json", JSON.stringify({ name: "a", scripts: { test: "declared-only" } }));
    writeFile(temporary.root, "packages/a/yarn.lock", "contents are metadata markers only\n");
    writeFile(temporary.root, "packages/b/package.json", JSON.stringify({ name: "b", scripts: { test: "declared-only" } }));
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.packageInventory?.packages[0]?.packageManager.name, "yarn");
    assert.equal(profile.packageInventory?.packages[1]?.packageManager.name, null);
    assert(profile.packageInventory?.packages.every((member) => member.packageManager.inherited !== true));
    assert.deepEqual(profile.commands.test.find((command) => command.cwd === "packages/a")?.argv, ["yarn", "run", "test"]);
    assert.equal(profile.commands.test.find((command) => command.cwd === "packages/b")?.argv, null);
    assert(!profile.warnings.some((record) => record.code === "PACKAGE_MANAGER_CONFLICT"));
  } finally { temporary.dispose(); }
});

test("missing directories, missing manifests, oversized manifests and unmatched patterns never claim complete inventory", () => {
  for (const mode of ["missing-directory", "missing-manifest", "oversized-manifest", "unmatched"]) {
    const temporary = createRepository({ independentPackages: [mode === "unmatched" ? "absent/*" : "packages/a"] });
    try {
      if (mode === "missing-manifest") writeFile(temporary.root, "packages/a/README.txt", "no manifest\n");
      if (mode === "oversized-manifest") writeFile(temporary.root, "packages/a/package.json", " ".repeat(BUDGETS.metadataFileBytes + 1));
      const profile = profileRepository(temporary.root);
      validateWithSchema(profile);
      assert.equal(profile.status, "partial");
      assert.equal(profile.project.kind, "monorepo");
      assert.equal(profile.packageInventory?.total, null);
      assert.equal(profile.packageInventory?.truncated, true);
      assert.equal(profile.coverage.categories.packageInventory, "partial");
      assert.equal(profile.coverage.truncated.packageInventory, true);
      assert(!profile.commands.test.some((command) => command.cwd !== "."));
      assert(profile.warnings.some((record) => record.code === "PACKAGE_INVENTORY_UNRESOLVED" && record.evidence.length > 0));
      if (mode === "oversized-manifest") assert(profile.warnings.some((record) => record.code === "METADATA_TOO_LARGE"));
    } finally { temporary.dispose(); }
  }
});

test("overlapping patterns and duplicate package names are evidenced partial inventories with deduplicated paths", () => {
  for (const overlap of [false, true]) {
    const temporary = createRepository({ independentPackages: overlap ? ["packages/*", "packages/a"] : ["packages/*"] });
    try {
      writeFile(temporary.root, "packages/a/package.json", JSON.stringify({ name: "same", packageManager: "npm@10.0.0" }));
      writeFile(temporary.root, "packages/b/package.json", JSON.stringify({ name: overlap ? "different" : "same", packageManager: "npm@10.0.0" }));
      const profile = profileRepository(temporary.root);
      validateWithSchema(profile);
      assert.equal(profile.status, "partial");
      assert.deepEqual(profile.packageInventory?.packages.map((member) => member.path), ["packages/a", "packages/b"]);
      assert.equal(profile.packageInventory?.total, null);
      assert.equal(profile.packageInventory?.truncated, true);
      assert(profile.warnings.some((record) => record.code === (overlap ? "PACKAGE_INVENTORY_UNRESOLVED" : "PACKAGE_INVENTORY_NAME_CONFLICT") && record.evidence.length > 0));
    } finally { temporary.dispose(); }
  }
});

test("independent inventory shares fixed package and metadata budgets", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    for (let index = 0; index <= BUDGETS.workspacePackages; index += 1) writeFile(temporary.root, `packages/p${String(index).padStart(3, "0")}/package.json`, JSON.stringify({ name: `p${index}`, packageManager: "npm@10.0.0", scripts: { test: "declared-only" } }));
    const bodyReads: string[] = [];
    const profile = profileRepository(temporary.root, { accessObserver: (event) => { if (event.operation === "read-body") bodyReads.push(event.path); } });
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.packageInventory?.returned, BUDGETS.workspacePackages);
    assert.equal(profile.packageInventory?.total, null);
    assert.equal(profile.packageInventory?.truncated, true);
    assert.equal(profile.workspace.truncated, false);
    assert(!bodyReads.includes("packages/p100/package.json"));
    assert(profile.coverage.usage.metadataFiles <= BUDGETS.workspacePackages + 1);
    assert(Buffer.byteLength(JSON.stringify(profile)) < BUDGETS.outputBytes);
    assert(profile.warnings.some((record) => record.code === "PACKAGE_INVENTORY_TRUNCATED" && record.evidence.length > 0));
  } finally { temporary.dispose(); }
});

test("symlinked members and excluded credential directories are not followed and make requested discovery partial", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "profile-independent-outside-"));
  try {
    writeFile(outside, "package.json", JSON.stringify({ name: "outside", packageManager: "npm@10.0.0", scripts: { test: "unsafe" } }));
    writeFile(temporary.root, "packages/safe/package.json", JSON.stringify({ name: "safe", packageManager: "npm@10.0.0" }));
    writeFile(temporary.root, "packages/credentials/package.json", JSON.stringify({ name: "credential-content" }));
    fs.symlinkSync(outside, path.join(temporary.root, "packages", "linked"), process.platform === "win32" ? "junction" : "dir");
    const reads: string[] = [];
    const profile = profileRepository(temporary.root, { accessObserver: (event) => { if (event.operation === "read-body") reads.push(event.path); } });
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.packageInventory?.total, null);
    assert.equal(profile.packageInventory?.truncated, true);
    assert.deepEqual(profile.packageInventory?.packages.map((member) => member.path), ["packages/safe"]);
    assert(!reads.some((member) => member.startsWith("packages/linked/") || member.startsWith("packages/credentials/")));
    assert(profile.warnings.some((record) => record.code === "SYMLINK_SKIPPED"));
  } finally { temporary.dispose(); fs.rmSync(outside, { recursive: true, force: true }); }
});

test("supported exclusions limit membership without reading excluded manifests", () => {
  const temporary = createRepository({ independentPackages: ["packages/*", "!packages/skip"] });
  try {
    writeFile(temporary.root, "packages/keep/package.json", JSON.stringify({ name: "keep", packageManager: "npm@10.0.0" }));
    writeFile(temporary.root, "packages/skip/package.json", "malformed excluded manifest");
    const reads: string[] = [];
    const profile = profileRepository(temporary.root, { accessObserver: (event) => { if (event.operation === "read-body") reads.push(event.path); } });
    validateWithSchema(profile);
    assert.equal(profile.status, "complete");
    assert.deepEqual(profile.packageInventory?.packages.map((member) => member.path), ["packages/keep"]);
    assert.equal(profile.packageInventory?.total, 1);
    assert(!reads.includes("packages/skip/package.json"));
  } finally { temporary.dispose(); }
});

test("optional source schema accepts ordinary profiles and rejects inconsistent independent contract metadata", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    writeFile(temporary.root, "packages/a/package.json", JSON.stringify({ name: "a", packageManager: "npm@10.0.0" }));
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    const wrongCount = structuredClone(profile);
    wrongCount.packageInventory!.returned = 2;
    assert(validateProfileSemantics(wrongCount).includes("package inventory returned"));
    const inherited = structuredClone(profile);
    inherited.packageInventory!.packages[0]!.packageManager.inherited = true;
    assert(validateProfileSemantics(inherited).includes("independent manager inheritance"));
    const missing = structuredClone(profile);
    delete missing.packageInventory;
    assert(validateProfileSemantics(missing).includes("monorepo inventory"));
    const unexpected = structuredClone(profile);
    (unexpected.packageInventory as unknown as Record<string, unknown>).manager = "npm";
    assert.throws(() => validateWithSchema(unexpected), /JSON Schema validation failed/u);
  } finally { temporary.dispose(); }
});

test("independent output truncation drops entire member scopes without inventing npm workspace membership", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    const noisyScripts: Record<string, string> = {};
    for (let index = 0; index < 500; index += 1) noisyScripts[`aux-${String(index).padStart(3, "0")}`] = "declared-only";
    for (let index = 0; index < BUDGETS.workspacePackages; index += 1) {
      writeFile(temporary.root, `packages/p${String(index).padStart(3, "0")}/package.json`, JSON.stringify({
        name: `${"n".repeat(4080)}${String(index).padStart(3, "0")}`,
        packageManager: "npm@10.0.0",
        scripts: { build: "declared-only", ...noisyScripts },
      }));
    }
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.project.kind, "monorepo");
    assert(profile.coverage.truncated.output);
    assert(profile.warnings.some((record) => record.code === "OUTPUT_TRUNCATED"));
    assert.equal(profile.packageInventory?.total, null);
    assert.equal(profile.packageInventory?.truncated, true);
    assert(profile.packageInventory!.returned < BUDGETS.workspacePackages);
    assert.equal(profile.workspace.enabled, false);
    assert.equal(profile.workspace.truncated, false);
    const retained = new Set(profile.packageInventory!.packages.map((member) => member.path));
    assert(profile.scripts.every((group) => group.cwd === "." || retained.has(group.cwd)));
    assert(profile.commands.build.every((command) => command.cwd === "." || retained.has(command.cwd)));
    assert(Buffer.byteLength(`${JSON.stringify(profile)}\n`) <= BUDGETS.outputBytes);
  } finally { temporary.dispose(); }
});

test("independent discovery obeys the shared total metadata-byte budget", () => {
  const temporary = createRepository({ independentPackages: ["packages/*"] });
  try {
    for (let index = 0; index < BUDGETS.workspacePackages; index += 1) {
      writeFile(temporary.root, `packages/p${String(index).padStart(3, "0")}/package.json`, JSON.stringify({
        name: `p${index}`,
        packageManager: "npm@10.0.0",
        metadataPadding: "x".repeat(128 * 1024),
      }));
    }
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.packageInventory?.total, null);
    assert.equal(profile.packageInventory?.truncated, true);
    assert(profile.coverage.truncated.metadataBytes);
    assert(profile.coverage.usage.metadataBytes <= BUDGETS.metadataTotalBytes);
    assert(profile.warnings.some((record) => record.code === "METADATA_TOO_LARGE"));
  } finally { temporary.dispose(); }
});

test("recursive independent patterns stop at the shared directory-depth boundary", () => {
  const temporary = createRepository({ independentPackages: ["deep/**/member"] });
  try {
    const levels = ["deep", ...Array.from({ length: BUDGETS.directoryDepth }, (_, index) => `level${index}`), "member"];
    writeFile(temporary.root, `${levels.join("/")}/package.json`, JSON.stringify({ name: "too-deep", packageManager: "npm@10.0.0" }));
    const reads: string[] = [];
    const profile = profileRepository(temporary.root, { accessObserver: (event) => { if (event.operation === "read-body") reads.push(event.path); } });
    validateWithSchema(profile);
    assert.equal(profile.status, "partial");
    assert.equal(profile.packageInventory?.total, null);
    assert.equal(profile.packageInventory?.truncated, true);
    assert(profile.coverage.truncated.depth);
    assert(!reads.includes(`${levels.join("/")}/package.json`));
    assert(profile.warnings.some((record) => record.code === "SCAN_LIMIT_REACHED"));
  } finally { temporary.dispose(); }
});
