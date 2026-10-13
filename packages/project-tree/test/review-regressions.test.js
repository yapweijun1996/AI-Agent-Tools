import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProjectGraph, queryGraph } from '../src/index.js';

const cli = fileURLToPath(new URL('../bin/aptree.js', import.meta.url));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-review-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'target.js'), 'export const value = 1;');
  return root;
}

test('invalid CLI and API file limits reject instead of removing bounds', async t => {
  const root = await fixture(t);
  for (const value of ['-1', '0', 'NaN', 'Infinity', '1.5', '9007199254740992']) {
    const child = spawnSync(process.execPath, [cli, 'context', '--root', root, '--max-files', value], { encoding: 'utf8' });
    assert.equal(child.status, 1, value);
    assert.equal(JSON.parse(child.stdout).schema, 'aptree.error.v1');
    await assert.rejects(buildProjectGraph({ root, maxFiles: Number(value) }));
  }
  assert.equal((await buildProjectGraph({ root, maxFiles: 2 })).meta.truncated, false);
});

test('comments, strings and template text do not create module edges', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'inert.js'), '// import "./target.js";\n/* export {value} from "./target.js"; */\nexport const text = "require(\'./target.js\')";\nconst template = `import "./target.js"`;\n');
  await fs.writeFile(path.join(root, 'real.js'), 'import "./target.js"; export {value} from "./target.js"; import("./target.js"); require("./target.js");');
  const graph = await buildProjectGraph({ root });
  const edges = graph.graph.edges.filter(edge => edge.kind === 'imports');
  const inert = graph.graph.nodes.find(node => node.path === 'inert.js');
  const real = graph.graph.nodes.find(node => node.path === 'real.js');
  assert.equal(edges.some(edge => edge.from === inert.id), false);
  assert.equal(edges.some(edge => edge.from === real.id && edge.specifier === './target.js'), true);
});

test('truncated pack indices preserve unavailable Git evidence', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, '.git/objects/pack'), { recursive: true });
  await fs.writeFile(path.join(root, '.git/HEAD'), 'a'.repeat(40) + '\n');
  for (const size of [8, 1032, 1060]) {
    const bytes = Buffer.alloc(size);
    bytes.writeUInt32BE(0xff744f63); bytes.writeUInt32BE(2, 4);
    if (size >= 1032) bytes.writeUInt32BE(100, 1028);
    await fs.writeFile(path.join(root, '.git/objects/pack/bad.idx'), bytes);
    const result = queryGraph(await buildProjectGraph({ root }), 'changed');
    assert.equal(result.adapter.available, false);
    assert.ok(result.adapter.note);
  }
});
