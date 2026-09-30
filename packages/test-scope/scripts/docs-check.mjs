import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const required = ["GOAL.md", "SPEC.md", "DESIGN.md", "EPIC.md", "ROADMAP.md", "TASK.md", "PROGRESS.md"];
for (const file of required) {
  const text = readFileSync(resolve(root, file), "utf8");
  assert.ok(text.length > 0, `${file} must not be empty`);
}
const spec = readFileSync(resolve(root, "SPEC.md"), "utf8");
for (const operation of ["capabilities", "discover", "plan", "explain"]) assert.ok(spec.includes(`\`${operation}\``), `SPEC.md must mention ${operation}`);
console.log("Documentation baseline passed");
