import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { profileRepository } from "../src/index.js";
import { assert, hashTree, materializeFixture, runCli, validateWithSchema, writeFile } from "./helpers.js";
import { FIXTURES } from "./fixtures.js";

test("schema and semantic validators reject no dangling evidence", () => {
  const fixture = FIXTURES.find((value) => value.id === "01-npm-single-package");
  assert(fixture !== undefined, "representative fixture missing");
  const temporary = materializeFixture(fixture);
  try {
    const profile = profileRepository(temporary.root);
    validateWithSchema(profile);
    const evidenceIds = new Set(profile.evidence.map((record) => record.id));
    for (const warning of profile.warnings) for (const reference of warning.evidence) assert(evidenceIds.has(reference), "warning evidence is dangling");
  } finally {
    temporary.dispose();
  }
});

test("CLI JSON, text, strict mode, and fatal argument behavior are stable", () => {
  const fixture = FIXTURES.find((value) => value.id === "12-no-test-script");
  const conflict = FIXTURES.find((value) => value.id === "09-conflicting-lockfiles");
  assert(fixture !== undefined && conflict !== undefined, "CLI fixtures missing");
  const temporary = materializeFixture(fixture);
  const conflictTemporary = materializeFixture(conflict);
  try {
    const jsonResult = runCli(temporary.root, "--format", "json");
    assert(jsonResult.status === 0, `expected complete CLI profile, got ${jsonResult.status}`);
    const parsed = JSON.parse(jsonResult.stdout) as { status: string };
    assert(parsed.status === "complete", "CLI JSON did not contain the profile");
    assert(jsonResult.stdout.endsWith("\n"), "CLI JSON did not end with one newline");
    const strictInfo = runCli(temporary.root, "--strict");
    assert(strictInfo.status === 0, "info-only strict profile should pass");
    const strictConflict = runCli(conflictTemporary.root, "--strict");
    assert(strictConflict.status === 2, "warning strict profile should exit 2");
    const textResult = runCli(temporary.root, "--format", "text");
    assert(textResult.status === 0 && textResult.stdout.includes("status: complete"), "text output did not render the same status");
    const invalidFlag = runCli(temporary.root, "--format", "yaml");
    assert(invalidFlag.status === 1, "invalid format should be fatal");
    const invalidProfile = JSON.parse(invalidFlag.stdout) as { status: string; warnings: Array<{ code: string }> };
    assert(invalidProfile.status === "error" && invalidProfile.warnings.some((warning) => warning.code === "INVALID_ARGUMENT"), "invalid format envelope is incorrect");
    const prettyText = runCli(temporary.root, "--format", "text", "--pretty");
    assert(prettyText.status === 1, "pretty text should be fatal");
    const invalidRoot = runCli(path.join(temporary.root, "missing"), "--format", "json");
    assert(invalidRoot.status === 1, "unreadable root should be fatal");
    validateWithSchema(JSON.parse(invalidRoot.stdout) as never);
  } finally {
    temporary.dispose();
    conflictTemporary.dispose();
  }
});

test("deterministic ordering is independent of file creation order", () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-order-a-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-order-b-"));
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "order", packageManager: "npm@10.0.0", scripts: { test: "test", build: "build" } }),
    "z.config.json": "ignored\n",
    "tsconfig.json": "ignored\n",
    "packages/z/package.json": JSON.stringify({ name: "z" }),
    "packages/a/package.json": JSON.stringify({ name: "a" }),
  };
  try {
    for (const [file, contents] of Object.entries(files)) writeFile(first, file, contents);
    for (const [file, contents] of Object.entries(files).reverse()) writeFile(second, file, contents);
    const firstProfile = profileRepository(first);
    const secondProfile = profileRepository(second);
    assert(JSON.stringify(firstProfile) === JSON.stringify(secondProfile), "profiles differed for equivalent trees");
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test("workspace return cap and output remain bounded", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-cap-"));
  try {
    writeFile(root, "package.json", JSON.stringify({ name: "cap", packageManager: "npm@10.0.0", workspaces: ["packages/*"] }));
    for (let index = 0; index < 150; index += 1) {
      const name = `package-${String(index).padStart(3, "0")}`;
      writeFile(root, `packages/${name}/package.json`, JSON.stringify({ name: `@cap/${name}`, scripts: { test: "must-not-run" } }));
    }
    const profile = profileRepository(root);
    validateWithSchema(profile);
    assert(profile.status === "partial", "workspace cap should be observable as partial");
    assert(profile.workspace.returned === 100 && profile.workspace.total === 150 && profile.workspace.truncated, "workspace cap facts are incorrect");
    assert(Buffer.byteLength(`${JSON.stringify(profile)}\n`, "utf8") <= profile.coverage.budgets.outputBytes, "profile exceeded output budget");
    assert(profile.warnings.some((warning) => warning.code === "WORKSPACE_TRUNCATED"), "workspace cap warning missing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("metadata, source-string, and depth limits remain fail-closed", () => {
  const oversized = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-oversized-"));
  const longValue = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-long-value-"));
  const deep = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-depth-"));
  try {
    writeFile(oversized, "package.json", JSON.stringify({ name: "x".repeat(300 * 1024) }));
    const readBodies: string[] = [];
    const oversizedProfile = profileRepository(oversized, { accessObserver: (event) => { if (event.operation === "read-body") readBodies.push(event.path); } });
    validateWithSchema(oversizedProfile);
    assert(oversizedProfile.status === "partial", "oversized metadata should be partial");
    assert(oversizedProfile.warnings.some((warning) => warning.code === "METADATA_TOO_LARGE"), "oversized metadata was not diagnosed");
    assert(!readBodies.includes("package.json"), "oversized manifest body was read");

    writeFile(longValue, "package.json", JSON.stringify({ name: "x".repeat(5000), packageManager: "npm@10.0.0" }));
    const longProfile = profileRepository(longValue);
    validateWithSchema(longProfile);
    assert(longProfile.project.name === null, "overlong project name was emitted");
    assert(longProfile.warnings.some((warning) => warning.code === "METADATA_TOO_LARGE"), "overlong source string was not diagnosed");

    writeFile(deep, "package.json", JSON.stringify({ name: "depth", packageManager: "npm@10.0.0", workspaces: ["deep/**"] }));
    const segments = ["deep"];
    for (let index = 0; index < 14; index += 1) segments.push(`level-${String(index).padStart(2, "0")}`);
    fs.mkdirSync(path.join(deep, ...segments), { recursive: true });
    writeFile(deep, `${segments.join("/")}/marker.txt`, "marker\n");
    const deepProfile = profileRepository(deep);
    validateWithSchema(deepProfile);
    assert(deepProfile.status === "partial", "deep workspace should be partial");
    assert(deepProfile.coverage.truncated.depth, "workspace depth cap was not recorded");
    assert(deepProfile.workspace.total === null, "incomplete workspace received a total");
    assert(deepProfile.warnings.some((warning) => warning.code === "SCAN_LIMIT_REACHED"), "depth cap warning was not emitted");
  } finally {
    fs.rmSync(oversized, { recursive: true, force: true });
    fs.rmSync(longValue, { recursive: true, force: true });
    fs.rmSync(deep, { recursive: true, force: true });
  }
});

test("metadata-file and serialized-output caps are deterministic", () => {
  const metadataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-metadata-cap-"));
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-output-cap-"));
  try {
    writeFile(metadataRoot, "package.json", JSON.stringify({ name: "metadata-cap", packageManager: "npm@10.0.0", workspaces: ["packages/*"] }));
    for (let index = 0; index < 1001; index += 1) {
      const member = `package-${String(index).padStart(4, "0")}`;
      writeFile(metadataRoot, `packages/${member}/package.json`, JSON.stringify({ name: `@metadata/${member}` }));
    }
    const metadataProfile = profileRepository(metadataRoot);
    validateWithSchema(metadataProfile);
    assert(metadataProfile.coverage.usage.metadataFiles === 1000, "metadata file budget was not enforced");
    assert(metadataProfile.warnings.some((warning) => warning.code === "SCAN_LIMIT_REACHED"), "metadata file cap warning was not emitted");

    const noisyScripts: Record<string, string> = {};
    for (let index = 0; index < 500; index += 1) noisyScripts[`aux-${String(index).padStart(3, "0")}`] = "x";
    writeFile(outputRoot, "package.json", JSON.stringify({ name: "output-cap", packageManager: "npm@10.0.0", workspaces: ["packages/*"] }));
    for (let index = 0; index < 100; index += 1) {
      const member = `package-${String(index).padStart(3, "0")}`;
      writeFile(outputRoot, `packages/${member}/package.json`, JSON.stringify({
        name: `${"n".repeat(4080)}${String(index).padStart(3, "0")}`,
        scripts: { build: "build", ...noisyScripts },
      }));
    }
    const outputProfile = profileRepository(outputRoot);
    validateWithSchema(outputProfile);
    assert(outputProfile.coverage.truncated.output, "serialized output cap was not recorded");
    assert(outputProfile.warnings.some((warning) => warning.code === "OUTPUT_TRUNCATED"), "serialized output cap warning was not emitted");
    assert(Buffer.byteLength(`${JSON.stringify(outputProfile)}\n`, "utf8") <= outputProfile.coverage.budgets.outputBytes, "serialized output exceeded the cap");
  } finally {
    fs.rmSync(metadataRoot, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
});

test("malformed YAML, traversal, and outside symlinks fail closed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-hostile-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-outside-"));
  try {
    writeFile(root, "package.json", JSON.stringify({ name: "hostile", packageManager: "pnpm@9.0.0", workspaces: ["../outside/*"] , main: "../outside.js" }));
    writeFile(root, "pnpm-workspace.yaml", "packages:\n  - *secret\n");
    writeFile(outside, "package.json", JSON.stringify({ name: "outside", scripts: { test: "CANARY_OUTSIDE_SCRIPT" } }));
    writeFile(outside, "outside.js", "CANARY_OUTSIDE_ENTRYPOINT\n");
    const before = hashTree(root);
    const readBodies: string[] = [];
    const profile = profileRepository(root, { accessObserver: (event) => { if (event.operation === "read-body") readBodies.push(event.path); } });
    validateWithSchema(profile);
    assert(profile.status === "partial", "hostile metadata should be partial");
    assert(profile.warnings.some((warning) => warning.code === "WORKSPACE_UNRESOLVED"), "malformed workspace YAML was not diagnosed");
    assert(profile.warnings.some((warning) => warning.code === "PATH_OUTSIDE_ROOT"), "entrypoint traversal was not diagnosed");
    assert(profile.entrypoints.some((entrypoint) => entrypoint.path === null), "outside entrypoint path was exposed");
    assert(!JSON.stringify(profile).includes("CANARY_"), "hostile canary leaked");
    assert(readBodies.every((file) => file === "package.json" || file === "pnpm-workspace.yaml"), "hostile profiler read an unexpected body");
    assert(before === hashTree(root), "hostile profiling changed the target");

    const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-link-"));
    try {
      writeFile(linkedRoot, "package.json", JSON.stringify({ name: "link", workspaces: ["linked/*"] }));
      fs.symlinkSync(path.join(outside), path.join(linkedRoot, "linked"), "junction");
      const linkedProfile = profileRepository(linkedRoot);
      validateWithSchema(linkedProfile);
      assert(linkedProfile.warnings.some((warning) => warning.code === "SYMLINK_SKIPPED" || warning.code === "PATH_OUTSIDE_ROOT"), "outside workspace link was followed");
      assert(!JSON.stringify(linkedProfile).includes("CANARY_OUTSIDE"), "outside workspace content leaked");
    } finally {
      fs.rmSync(linkedRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("protected directories cannot become inspection roots", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-protected-root-"));
  const protectedRoot = path.join(parent, ".ssh");
  try {
    fs.mkdirSync(protectedRoot);
    writeFile(protectedRoot, "package.json", JSON.stringify({ name: "must-not-be-read" }));
    const profile = profileRepository(protectedRoot);
    validateWithSchema(profile);
    assert(profile.status === "error", "protected directory was accepted as an inspection root");
    assert(profile.warnings.some((warning) => warning.code === "ROOT_UNREADABLE"), "protected root did not produce a fatal boundary diagnostic");
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("profiler source has no target process or network execution path", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const sourceFiles: string[] = [];
  collectTypeScriptFiles(sourceRoot, sourceFiles);
  const source = sourceFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert(!/node:child_process|node:http|node:https|node:net|node:dns|\bfetch\s*\(/u.test(source), "profiler source contains a process or network primitive");
  assert(!/execSync|spawnSync|execFile|import\s*\(/u.test(source.replace(/import\.meta\.url/gu, "")), "profiler source contains execution code");
});

test("manager conflicts, runtime roles, and declared entrypoint boundaries are explicit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-contract-"));
  const dualWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-dual-workspace-"));
  try {
    writeFile(root, "package.json", JSON.stringify({
      name: "contract",
      packageManager: "bun@1.0.0",
      engines: { node: 20 },
      scripts: { test: "must-not-run" },
      main: "dist/*.js",
      bin: { contract: "bin/missing.js" },
      exports: { ".": null, "./outside": "../outside.js" },
    }));
    writeFile(root, ".nvmrc", "22\n");
    writeFile(root, "package-lock.json", "npm lock\n");
    const profile = profileRepository(root);
    validateWithSchema(profile);
    assert(profile.status === "partial", "unsupported declaration should be partial");
    assert(profile.packageManager.name === null && !profile.packageManager.invocationAvailable, "unsupported declaration fell back to a lockfile");
    assert(profile.warnings.some((warning) => warning.code === "PACKAGE_MANAGER_UNSUPPORTED"), "unsupported manager was not diagnosed");
    assert(profile.warnings.some((warning) => warning.code === "RUNTIME_DECLARATION_INVALID"), "invalid runtime declaration was not diagnosed");
    assert(profile.runtimes.some((runtime) => runtime.role === "development-pin" && runtime.value === "22"), "development pin role was not preserved");
    assert(profile.entrypoints.some((entrypoint) => entrypoint.pointer === "/main" && entrypoint.existence === "not_checked" && entrypoint.path === "dist/*.js"), "wildcard entrypoint was incorrectly checked");
    assert(profile.entrypoints.some((entrypoint) => entrypoint.pointer === "/bin/contract" && entrypoint.existence === "missing"), "literal bin entrypoint was not checked");
    assert(profile.entrypoints.every((entrypoint) => entrypoint.pointer !== "/exports/.") && profile.entrypoints.some((entrypoint) => entrypoint.path === null), "null or outside exports were mishandled");

    writeFile(dualWorkspace, "package.json", JSON.stringify({ name: "dual", packageManager: "npm@10.0.0", workspaces: ["packages/a"] }));
    writeFile(dualWorkspace, "pnpm-workspace.yaml", "packages:\n  - packages/b\n");
    writeFile(dualWorkspace, "packages/a/package.json", JSON.stringify({ name: "a" }));
    writeFile(dualWorkspace, "packages/b/package.json", JSON.stringify({ name: "b" }));
    const dual = profileRepository(dualWorkspace);
    validateWithSchema(dual);
    assert(dual.status === "partial" && dual.workspace.manager === null, "disagreeing workspace declarations were treated as canonical");
    assert(dual.warnings.some((warning) => warning.code === "WORKSPACE_UNRESOLVED"), "workspace disagreement was not diagnosed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(dualWorkspace, { recursive: true, force: true });
  }
});

function collectTypeScriptFiles(directory: string, result: string[]): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collectTypeScriptFiles(target, result);
    else if (entry.isFile() && entry.name.endsWith(".ts")) result.push(target);
  }
}
