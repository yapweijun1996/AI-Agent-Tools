import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodeResult } from "../src/index.js";

export const SNAP = "git:0123456789abcdef";
export const PACKAGE_ROOT = fileURLToPath(new URL("../", import.meta.url));
export const EXAMPLES = path.join(PACKAGE_ROOT, "examples");

export function withRoot(callback) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "context-pack-test-")));
  try { return callback(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
export const write = (root, name, content) => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), content);
};
export const writeJson = (root, name, value) => write(root, name, JSON.stringify(value));
// A fictional protocol fixture: valid Hub envelope from an unregistered example tool.
export function envelopeOf(data, overrides = {}) {
  return {
    schema_version: "1.0.0", tool: { id: "agent-example", version: "1.0.0" }, status: "ok", complete: true,
    data, errors: [], warnings: [], meta: { scope: "Example", limits: { max_items: 1 } }, ...overrides,
  };
}
export const entry = (id, artifact, overrides = {}) => ({
  id, artifact, tool: { id: "agent-example", version: "1.0.0" }, snapshot: SNAP, ...overrides,
});
export const manifestOf = (items, overrides = {}) => ({
  manifest_version: "1.0.0", profile: "context-pack-v1", task: { id: "task-1", target: "src/a.js" },
  snapshot: SNAP, budget: { unit: "utf8-bytes", max: 65536 }, items, ...overrides,
});
// Writes artifacts a.json..n.json (one data object each) plus manifest.json; returns the manifest.
export function setup(root, datas, itemOverrides = [], manifestOverrides = {}) {
  const items = datas.map((data, index) => {
    const file = `art/${String.fromCharCode(97 + index)}.json`;
    writeJson(root, file, envelopeOf(data));
    return entry(`item-${String.fromCharCode(97 + index)}`, file, itemOverrides[index] ?? {});
  });
  const manifest = manifestOf(items, manifestOverrides);
  writeJson(root, "manifest.json", manifest);
  return manifest;
}
export const options = (root, extra = {}) => ({ root, manifest: "manifest.json", ...extra });
export const serialized = (result) => Buffer.byteLength(encodeResult(result), "utf8") + 1;
export const codeOf = (result) => result.errors[0]?.code;
