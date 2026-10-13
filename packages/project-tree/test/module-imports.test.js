import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsImports } from '../src/module-imports.js';

for (const [name, source, expected] of [
  ['comments', '// import "./fake.js";\n/* require("./fake.js") */', []],
  ['quoted text', 'const text = "import \'./fake.js\'"; const other = \'require("./fake.js")\';', []],
  ['template text', 'const text = `import "./fake.js"`;', []],
  ['template expression', 'const text = `text ${import("./real.js")} require("./fake.js")`;', ['./real.js']],
  ['regex literal', 'const pattern = /import ".\\/fake.js"/;', []],
  ['regex after a condition', 'if (ok) /import ".\\/fake.js"/.test(text);', []],
  ['division before an import', 'const n = 1 / 2; import "./real.js";', ['./real.js']],
  ['named from binding', 'export {from as value} from "./real.js";', ['./real.js']],
  ['quoted export binding', 'export {"quoted-name" as value} from "./real.js";', ['./real.js']],
  ['type import', 'import type {Item} from "./real.js";', ['./real.js']],
  ['comment inside dynamic import', 'import(/* local */ "./real.js");', ['./real.js']],
  ['property calls', 'obj.import("./fake.js"); obj.require("./fake.js");', []],
]) test(name, () => assert.deepEqual(extractJsImports(source), expected));
