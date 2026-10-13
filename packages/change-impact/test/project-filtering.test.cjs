const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");
const { SourceSnapshot } = require("../dist/snapshot.js");
const { createProjectContext } = require("../dist/project.js");

test("snapshot project membership matches compiler include/exclude semantics", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "impact-filter-")));
  try {
    const config = { compilerOptions: { target: "ES2022" }, include: ["src/**/*.ts"], exclude: ["src/ignored", "tests"] };
    const files = new Map([
      ["tsconfig.json", JSON.stringify(config)],
      ["src/a.ts", "export const a = 1;"],
      ["src/deep/b.ts", "export const b = 2;"],
      ["src/ignored/c.ts", "export const c = 3;"],
      ["tests/outside.ts", "export const outside = 4;"],
    ]);
    for (const [name, text] of files) {
      const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
    }
    const native = ts.parseJsonConfigFileContent(config, ts.sys, root).fileNames.map(file => path.relative(root, file).replaceAll("\\", "/")).sort();
    const context = createProjectContext(new SourceSnapshot(root, "working-tree", files));
    try { assert.deepEqual(context.project.files, native); } finally { context.languageService.dispose(); }
    // A revision snapshot must use its own inventory even if disk content differs.
    files.set("src/a.ts", 'import {outside} from "../tests/outside"; export const a = outside;');
    files.delete("src/deep/b.ts");
    const revised = createProjectContext(new SourceSnapshot(root, "revision", files));
    try {
      assert.deepEqual(revised.project.files, ["src/a.ts"]);
      assert.ok(revised.program.getSourceFile(path.join(root, "tests/outside.ts")), "explicitly imported excluded files still resolve");
    } finally { revised.languageService.dispose(); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
