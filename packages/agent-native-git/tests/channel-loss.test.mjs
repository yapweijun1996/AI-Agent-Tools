import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { executionFixture, ROOT, eventually } from './execution-fixture.mjs';
import { createNativePlatform } from '../dist/platform.js';
import { readTerminationReceipt } from '../dist/execution-native.js';

function frame(value) {
  const body = Buffer.from(JSON.stringify(value)), header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}

for (const fault of ['partial-header', 'partial-body', 'invalid-control', 'lost-start-reader', 'lost-resume-reader']) {
  test(`owned native ${fault} retains authenticated termination rather than exception-only cleanup`, { timeout: 45000 }, async () => {
    const f = executionFixture({ modes: ['idle'] });
    let child, verified = false, timer;
    try {
      const directory = createNativePlatform(ROOT).preparePrivateDirectory(join(f.privateRoot, 'channel fault')).canonicalPath;
      const nonce = 'c'.repeat(64);
      const spec = { executable: f.executable, executableHash: f.executableHash, args: ['idle', f.observations.get('idle')],
        cwd: f.repo, environment: { SystemRoot: process.env.SystemRoot }, input: '{}',
        supervisorId: 'sup_channel_fault', launchIdentity: 'b'.repeat(64), artifactDirectory: directory,
        authority: { projectId: 'prj_channel_fault', authorityIncarnation: 'a'.repeat(64), coordinatorEpoch: 1,
          resourceKey: 'task:tsk_channel_fault', fencingToken: 1, ownerId: 'owner_fixture' },
        budget: { timeoutMs: 10000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 10000, stopTimeoutMs: 3000 } };
      const helperHash = JSON.parse(readFileSync(join(ROOT, 'dist/native/execution.identity.json'), 'utf8')).exeSha256;
      child = spawn(join(ROOT, 'dist/native/execution.exe'), ['--supervisor-v1'],
        { cwd: ROOT, env: {}, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      const exited = Promise.withResolvers();
      child.once('error', exited.reject);
      child.once('close', (code, signal) => exited.resolve({ code, signal }));
      child.stdin.on('error', () => {}); // Reader loss is the fault under test, not a writer proof.
      let output = Buffer.alloc(0), diagnostic = '';
      child.stderr.on('data', bytes => { diagnostic += bytes.toString(); });
      child.stdout.on('data', bytes => {
        output = Buffer.concat([output, bytes]);
        while (output.length >= 4 && output.length >= 4 + output.readUInt32BE()) {
          const size = output.readUInt32BE(), value = JSON.parse(output.subarray(4, size + 4));
          output = output.subarray(size + 4);
          if (value.type !== 'started') continue;
          if (fault === 'partial-header') child.stdin.end(Buffer.from([0, 0]));
          else if (fault === 'partial-body') {
            const header = Buffer.alloc(4); header.writeUInt32BE(128);
            child.stdin.end(Buffer.concat([header, Buffer.from('{"op":')]));
          } else if (fault === 'invalid-control') child.stdin.write(frame({ op: 'resume', controlNonce: '0'.repeat(64) }));
          else if (fault === 'lost-resume-reader') {
            child.stdin.write(frame({ op: 'resume', controlNonce: nonce }));
            child.stdout.destroy();
          }
        }
      });
      if (fault === 'lost-start-reader') child.stdout.destroy();
      child.stdin.write(frame({ spec, controlNonce: nonce, helperHash }));
      const receiptPath = join(directory, 'termination.json');
      const receipt = await eventually(() => {
        if (!existsSync(receiptPath)) return null;
        try { return JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { return null; }
      }, value => value?.writerTreeTerminated === true, { timeoutMs: 15000, label: fault + ' durable native receipt' });
      child.stdin.end();
      const closed = await Promise.race([exited.promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Owned native helper did not close: ' + f.base)), 10000);
      })]);
      assert.equal(closed.code, 0, diagnostic); assert.equal(closed.signal, null);
      const authenticated = await readTerminationReceipt(ROOT, receiptPath, spec, receipt.process);
      verified = true;
      assert.equal(authenticated.writerTreeTerminated, true);
      assert.equal(authenticated.rootExitCode, 125);
      if (fault !== 'lost-resume-reader') assert.equal(f.started('idle').length, 0, 'No complete approved resume was delivered.');
    } finally {
      clearTimeout(timer); child?.stdin.end();
      if (verified) await f.cleanup();
      else console.error('Preserved unverified owned native fixture: ' + f.base);
    }
  });
}
