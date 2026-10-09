'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..');
test('every implemented package supports standalone help using its native output', async (t) => {
  for (const folder of readdirSync(join(root, 'packages')).sort()) {
    await t.test(folder, () => {
      const dir = join(root, 'packages', folder);
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      const entry = Object.values(pkg.bin)[0];
      const result = spawnSync(process.execPath, [join(dir, entry), '--help'], { cwd: root, encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.ok((result.stdout + result.stderr).includes(Object.keys(pkg.bin)[0]), 'Help must identify the executable');
    });
  }
});
