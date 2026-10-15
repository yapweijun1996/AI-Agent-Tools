import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApprovedGit, discover } from '../dist/core/git.js';
import { createNativePlatform } from '../dist/platform.js';
import { fixture, ROOT } from './stage1-fixture.mjs';

function approved(f) {
  const platform = createNativePlatform(ROOT);
  platform.preparePrivateDirectory(join(f.privateRoot, 'hooks'));
  return new ApprovedGit(platform, discover(platform, f.repo), f.policy.git, f.privateRoot);
}

test('approved Git receives bounded input and returns its exact result despite delayed coordinator callbacks', { timeout: 180000 }, async () => {
  const f = fixture();
  try {
    const git = approved(f), input = 'Owned read-only Git deadline regression\n';
    const result = git.runBytes(['hash-object', '--stdin'], input);
    // Only this isolated observer thread is delayed; the real command's unchanged deadline must remain independent.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 17000);
    const expected = createHash('sha1').update('blob ' + Buffer.byteLength(input) + '\0').update(input).digest('hex') + '\n';
    assert.equal((await result).toString('ascii'), expected);
    assert.equal(f.git(['rev-parse', 'HEAD']), f.oid);
  } finally { f.cleanup(); }
});

test('approved Git preserves binary bytes and rejects output beyond its existing combined budget', { timeout: 180000 }, async () => {
  const f = fixture();
  try {
    const git = approved(f), bytes = Buffer.alloc(65536);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const binary = join(f.repo, 'owned-binary.dat'); writeFileSync(binary, bytes);
    const binaryOid = f.git(['hash-object', '-w', '--no-filters', binary]);
    assert.deepEqual(await git.runBytes(['cat-file', 'blob', binaryOid]), bytes);
    const large = join(f.repo, 'owned-large.dat'); writeFileSync(large, Buffer.alloc(4_194_305, 0x61));
    const largeOid = f.git(['hash-object', '-w', '--no-filters', large]);
    await assert.rejects(git.runBytes(['cat-file', 'blob', largeOid]), error => error.code === 'GIT_OUTPUT_TOO_LARGE');
    assert.equal(f.git(['rev-parse', 'HEAD']), f.oid);
  } finally { f.cleanup(); }
});
