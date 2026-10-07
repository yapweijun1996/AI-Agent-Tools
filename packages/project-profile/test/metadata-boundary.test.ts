import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Profile } from "../src/types.js";

const packageRoot = path.resolve(fileURLToPath(new URL("../../", import.meta.url)));
const hook = path.join(packageRoot, "test/helpers/metadata-boundary-hook.mjs");
const cli = fileURLToPath(new URL("../src/bin.js", import.meta.url));

function checkBoundary(mode: "initial" | "fifo" | "replacement") {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "project-profile-boundary-")));
  const file = path.join(root, "package.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ name: "ordinary", packageManager: "npm@10.0.0" }));
    if (mode === "initial") {
      fs.unlinkSync(file);
      assert.equal(spawnSync("mkfifo", [file]).status, 0);
    }
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, cli, root], {
      encoding: "utf8", timeout: 3000, killSignal: "SIGKILL",
      env: { ...process.env, PROFILE_TEST_BOUNDARY: JSON.stringify({
        mode, file, held: path.join(root, "held.json"),
      }) },
    });
    assert.ifError(child.error);
    assert.equal(child.status, 2, child.stderr);
    const profile = JSON.parse(child.stdout) as Profile;
    assert.equal(profile.status, "partial");
    assert.equal(profile.project.name, null);
    assert.equal(profile.coverage.usage.metadataFiles, 0);
    const line = child.stderr.split("\n").find(value => value.startsWith("BOUNDARY_OBSERVATION:"));
    assert.ok(line, child.stderr);
    const observation = JSON.parse(line.slice("BOUNDARY_OBSERVATION:".length)) as {
      mutated: boolean; readBytes: number; closed: boolean;
    };
    assert.equal(observation.readBytes, 0);
    if (mode !== "initial") {
      assert.equal(observation.mutated, true);
      assert.equal(observation.closed, true);
      assert.ok(profile.warnings.some(warning => warning.code ===
        (mode === "fifo" ? "METADATA_UNREADABLE" : "REPOSITORY_CHANGED")));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("an initial FIFO returns a bounded partial profile", {
  skip: process.platform === "win32" ? "POSIX FIFO fixture" : false,
}, () => checkBoundary("initial"));
test("a real FIFO substituted at open returns a bounded partial profile", {
  skip: process.platform === "win32" ? "POSIX FIFO fixture" : false,
}, () => checkBoundary("fifo"));
test("a different regular file substituted at open is rejected before reading", () => checkBoundary("replacement"));
