import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { packContext, encodeResult } from "../src/index.js";
import { entry, manifestOf, PACKAGE_ROOT, setup, withRoot, writeJson } from "./fixture.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "buffer" });
const text = (buffer) => buffer.toString("utf8");
const packageRoot = PACKAGE_ROOT;

test("help and version are explicit text modes", () => {
  for (const args of [[], ["--help"]]) {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.match(text(result.stdout), /agent-context-pack pack --manifest/);
    assert.match(text(result.stdout), /never clipped/);
  }
  const version = run(["--version"]);
  assert.equal(text(version.stdout), "0.1.0\n");
  assert.equal(version.status, 0);
});

test("pack --json emits exactly one envelope line equal to the API result, and used counts those bytes", () => {
  const result = run(["pack", "--manifest", "examples/manifest.json", "--json"], packageRoot);
  assert.equal(result.status, 0);
  assert.equal(text(result.stderr), "");
  const output = text(result.stdout);
  assert.equal(output.endsWith("}\n"), true);
  assert.equal(output.split("\n").length, 2);
  const emitted = JSON.parse(output);
  assert.equal(output, encodeResult(packContext({ root: packageRoot, manifest: "examples/manifest.json" })) + "\n");
  assert.equal(emitted.data.budget.used, result.stdout.length, "the budget counts the bytes actually written to stdout");
  assert.equal(emitted.status, "ok");
});

test("--root selects the resolution directory and text mode summarizes", () => {
  const result = run(["pack", "--manifest", "examples/manifest.json", "--root", packageRoot]);
  assert.equal(result.status, 0);
  assert.match(text(result.stdout), /^ok: included 2 omitted 0 used \d+\/8192 utf8-bytes\n$/);
});

test("capabilities and exit codes follow the documented classes", () => withRoot((root) => {
  const caps = JSON.parse(text(run(["capabilities", "--json"]).stdout));
  assert.equal(caps.tool.id, "agent-context-pack");
  assert.equal(run(["capabilities", "--json"]).status, 0);
  setup(root, [{ n: 1 }]);
  assert.equal(run(["pack", "--manifest", "manifest.json", "--root", root, "--json"]).status, 0);
  writeJson(root, "manifest.json", manifestOf([entry("a", "art/a.json", { snapshot: "other" })]));
  const incomplete = run(["pack", "--manifest", "manifest.json", "--root", root, "--json"]);
  assert.equal(incomplete.status, 3);
  assert.equal(JSON.parse(text(incomplete.stdout)).errors[0].code, "SNAPSHOT_MISMATCH");
  assert.equal(text(run(["pack", "--manifest", "manifest.json", "--root", root]).stdout), "incomplete: SNAPSHOT_MISMATCH\n");
  writeJson(root, "manifest.json", manifestOf([entry("a", "../art/a.json")]));
  assert.equal(run(["pack", "--manifest", "manifest.json", "--root", root, "--json"]).status, 4);
  writeJson(root, "manifest.json", { nope: true });
  assert.equal(run(["pack", "--manifest", "manifest.json", "--root", root, "--json"]).status, 2);
  assert.equal(run(["pack", "--manifest", "absent.json", "--root", root, "--json"]).status, 2);
}));

test("unknown, duplicate and malformed arguments are rejected without side effects", () => withRoot((root) => {
  setup(root, [{ n: 1 }]);
  const base = ["pack", "--manifest", "manifest.json", "--root", root, "--json"];
  for (const args of [
    ["bogus", "--json"], ["pack", "--json"], [...base, "--unknown", "1"], [...base, "--manifest", "manifest.json"],
    ["pack", "--manifest", "--json", "--root", root], ["pack", "--manifest"], ["capabilities", "--root", root, "--json"],
    [...base, "--max-items", "0"], [...base, "--max-items", "65"], [...base, "--max-items", "1e1"], [...base, "--max-items", "-1"],
    [...base, "--max-output-bytes", "1023"], [...base, "--max-budget-bytes", "1023"], [...base, "--max-total-bytes", "x"],
  ]) {
    const result = run(args);
    assert.equal(result.status, 2, args.join(" "));
    if (args.includes("--json")) {
      const emitted = JSON.parse(text(result.stdout));
      assert.equal(emitted.errors[0].code, "INVALID_INPUT");
      assert.equal(emitted.data, null);
    }
  }
}));

test("valid lower limits are accepted and reported in meta", () => withRoot((root) => {
  setup(root, [{ n: 1 }], [], { budget: { unit: "utf8-bytes", max: 4096 } });
  const result = run(["pack", "--manifest", "manifest.json", "--root", root, "--max-items", "3", "--max-budget-bytes", "4096", "--json"]);
  assert.equal(result.status, 0);
  const limits = JSON.parse(text(result.stdout)).meta.limits;
  assert.equal(limits.max_items, 3);
  assert.equal(limits.max_budget_bytes, 4096);
  const atLimit = run(["pack", "--manifest", "manifest.json", "--root", root, "--max-items", "1", "--json"]);
  assert.equal(atLimit.status, 0, "one declared item fits a limit of one");
  const over = run(["pack", "--manifest", "manifest.json", "--root", root, "--max-budget-bytes", "1024", "--json"]);
  assert.equal(over.status, 3);
  assert.equal(JSON.parse(text(over.stdout)).errors[0].code, "RESOURCE_LIMIT");
}));

test("an output cap smaller than the pack gives a valid bounded failure on stdout", () => {
  const result = run(["pack", "--manifest", "examples/manifest.json", "--max-output-bytes", "1024", "--json"], packageRoot);
  assert.equal(result.status, 3);
  assert.ok(result.stdout.length <= 1024);
  const emitted = JSON.parse(text(result.stdout));
  assert.equal(emitted.errors[0].code, "RESOURCE_LIMIT");
  assert.equal(emitted.data, null);
});

test("the CLI reads no stdin and writes nothing", () => withRoot((root) => {
  setup(root, [{ n: 1 }]);
  const before = fs.readdirSync(root, { recursive: true }).sort();
  const result = spawnSync(process.execPath, [cli, "pack", "--manifest", "manifest.json", "--root", root, "--json"], { input: "ignored stdin" });
  assert.equal(result.status, 0);
  assert.deepEqual(fs.readdirSync(root, { recursive: true }).sort(), before);
}));
