import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, linkSync, symlinkSync, cpSync, copyFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createNativePlatform } from '../dist/platform.js';
import { fixture, ROOT } from './stage1-fixture.mjs';

test('native identity unifies case/junction aliases but private state rejects reparses and hardlinks', () => {
  const f = fixture();
  try {
    const platform = createNativePlatform(ROOT);
    const target = platform.identify(f.repo), alias = join(f.base, 'native alias'); symlinkSync(f.repo, alias, 'junction');
    const aliased = platform.identify(alias);
    assert.equal(aliased.identity, target.identity); assert.equal(aliased.canonicalPath, target.canonicalPath); assert.equal(aliased.reparsePoint, true);
    assert.equal(platform.identify(f.repo.toUpperCase()).identity, target.identity);
    assert.throws(() => platform.preparePrivateDirectory(alias), error => error.code === 'INSECURE_STATE');
    const file = join(f.privateRoot, 'input.json'); writeFileSync(file, '{}');
    const admitted = platform.assertPrivateFile(file); assert.equal(admitted.directory, false); assert.equal(admitted.localDisk, true);
    linkSync(file, join(f.privateRoot, 'second-link.json'));
    assert.throws(() => platform.assertPrivateFile(file), error => error.code === 'INSECURE_STATE');
  } finally { f.cleanup(); }
});
test('existing unprotected directories are rejected without permission or content repair', () => {
  const f = fixture();
  try {
    const directory = join(f.privateRoot, 'unprotected-existing'); mkdirSync(directory);
    writeFileSync(join(directory, 'owner-data.txt'), 'Preserve owner data');
    const acl = () => {
      const child = spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-Command', '(Get-Acl -LiteralPath $env:ANGIT_FIXTURE_PATH).Sddl'], { encoding: 'utf8', shell: false, timeout: 10000, env: { ...process.env, ANGIT_FIXTURE_PATH: directory } });
      assert.equal(child.status, 0, child.stderr); return child.stdout.trim();
    };
    const before = acl(), platform = createNativePlatform(ROOT);
    assert.throws(() => platform.preparePrivateDirectory(directory), error => error.code === 'INSECURE_STATE');
    assert.throws(() => platform.assertPrivateDirectory(directory), error => error.code === 'INSECURE_STATE');
    assert.equal(acl(), before); assert.equal(readFileSync(join(directory, 'owner-data.txt'), 'utf8'), 'Preserve owner data');
    const missing = join(f.privateRoot, 'missing');
    assert.throws(() => platform.assertPrivateDirectory(missing), error => error.code === 'PATH_NOT_FOUND');
    assert.equal(existsSync(missing), false);
  } finally { f.cleanup(); }
});
test('packaged source/binary pairing rejects tampering before native state effects', () => {
  const f = fixture();
  try {
    const copied = join(f.privateRoot, 'copied package'); mkdirSync(join(copied, 'native'), { recursive: true });
    cpSync(join(ROOT, 'dist/native'), join(copied, 'dist/native'), { recursive: true });
    copyFileSync(join(ROOT, 'native/Platform.cs'), join(copied, 'native/Platform.cs'));
    const platform = createNativePlatform(copied); const owner = platform.ownerContext(); assert.match(owner.sid, /^S-1-/);
    appendFileSync(join(copied, 'native/Platform.cs'), '\n// Tampered disposable package source.\n');
    const target = join(f.privateRoot, 'must-not-be-created');
    assert.throws(() => platform.preparePrivateDirectory(target), error => error.code === 'NATIVE_IDENTITY_MISMATCH');
    assert.equal(existsSync(target), false);
  } finally { f.cleanup(); }
});
