import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const hook = fileURLToPath(new URL("../helpers/file-boundary-hook.mjs", import.meta.url));
const loader = Number(process.versions.node.split(".")[0]) === 18 ? "--loader" : "--import";

function runBoundary(mode: "leaf" | "ancestor" | "growth", operation: "api" | "cli") {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "code-slice-boundary-")));
  const root = path.join(workspace, "root");
  const directory = path.join(root, "nested");
  const outsideDirectory = path.join(workspace, "outside");
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(outsideDirectory);
  const file = path.join(directory, "input.js");
  const outside = path.join(outsideDirectory, "input.js");
  const source = "export function inside() { return 'ordinary'; }\n";
  fs.writeFileSync(file, source);
  fs.writeFileSync(outside, "export function outside() { return 'SYNTHETIC_OUTSIDE_MARKER'; }\n");
  const held = path.join(root, "held");
  const name = mode === "growth" ? "inside" : "outside";
  const maxBytes = Buffer.byteLength(source);
  try {
    const args = [loader, "tsx", "--import", pathToFileURL(hook).href];
    if (operation === "cli") {
      args.push(path.join(packageRoot, "src/cli/index.ts"), "symbol", file, name,
        "--root", root, "--json");
      if (mode === "growth") args.push("--max-bytes", String(maxBytes));
    } else {
      const entry = pathToFileURL(path.join(packageRoot, "src/core/index.ts")).href;
      const params = { file, root, selector: { type: "symbol", name },
        ...(mode === "growth" ? { maxBytes } : {}) };
      args.push("--input-type=module", "--eval", "const { slice } = await import(" +
        JSON.stringify(entry) + "); console.log(JSON.stringify(await slice(" +
        JSON.stringify(params) + ")));");
    }
    const child = spawnSync(process.execPath, args, {
      cwd: packageRoot, encoding: "utf8", timeout: 10_000,
      env: { ...process.env, CODE_SLICE_TEST_BOUNDARY: JSON.stringify({
        mode, file, directory, outside, outsideDirectory, held,
      }) },
    });
    assert.ifError(child.error);
    const result = JSON.parse(child.stdout) as { ok: boolean; error?: { code: string } };
    const observationLine = child.stderr.split("\n").find(line => line.startsWith("BOUNDARY_OBSERVATION:"));
    assert.ok(observationLine, child.stderr);
    const observation = JSON.parse(observationLine.slice("BOUNDARY_OBSERVATION:".length)) as {
      mutated: boolean; grew: boolean; readBytes: number; closed: boolean;
    };
    assert.equal(mode === "growth" ? observation.grew : observation.mutated, true);
    assert.equal(result.ok, false, child.stdout);
    assert.doesNotMatch(child.stdout, /SYNTHETIC_OUTSIDE_MARKER/);
    if (mode === "growth") {
      assert.equal(result.error?.code, "FILE_TOO_LARGE");
      assert.ok(observation.readBytes > 0);
      assert.ok(observation.readBytes <= maxBytes + 1);
      assert.equal(observation.closed, true);
    } else {
      assert.ok(["FILE_OUTSIDE_ROOT", "FILE_NOT_FOUND"].includes(result.error?.code ?? ""));
      assert.equal(observation.readBytes, 0, "outside bytes were read before rejection");
      if (mode === "ancestor") assert.equal(observation.closed, true);
    }
    if (operation === "cli") assert.notEqual(child.status, 0);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

for (const operation of ["api", "cli"] as const) {
  test(operation + " rejects a real outside-root leaf substitution before reading", {
    skip: process.platform === "win32" ? "File symlink creation requires Windows privileges" : false,
  }, () => runBoundary("leaf", operation));
  test(operation + " rejects an outside-root ancestor link or junction before reading", () => runBoundary("ancestor", operation));
}
test("API reads remain bounded when an admitted file grows", () => runBoundary("growth", "api"));
