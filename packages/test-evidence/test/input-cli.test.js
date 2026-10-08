import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseJson, readArtifact } from '../src/input.js';
import { decode } from '../src/normalize.js';
import { summarizeEvidence, verifyEvidence } from '../src/index.js';
import { fixture, bundle, root } from './helpers.js';
const cli = fileURLToPath(new URL('../src/cli.js', import.meta.url));
const inputUrl = new URL('../src/input.js', import.meta.url).href;

test('strict UTF-8 and JSON reject duplicates, non-finite, malformed and depth overflow', () => {
  for (const text of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '1e999', '[1,]', '{"a":undefined}'])
    assert.throws(() => parseJson(text), { code: 'INVALID_INPUT' });
  assert.throws(() => parseJson('['.repeat(34) + '0' + ']'.repeat(34)), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00])), { code: 'INVALID_ENCODING' });
  assert.throws(() => decode(Buffer.from([0xc0, 0xaf])), { code: 'INVALID_ENCODING' });
  assert.deepEqual({ ...parseJson(decode(Buffer.from('\uFEFF{"ok":true}'))) }, { ok: true });
  assert.throws(() => parseJson(decode(Buffer.from('\uFEFF\uFEFF{}'))), { code: 'INVALID_INPUT' });
});
test('file and stdin CLI match core, failures produce one safe JSON and consistent exit', () => {
  const f = fixture(), text = JSON.stringify(f.request);
  f.artifacts[0].bytes = readFileSync(join(root, 'examples/pass.json'));
  for (const operation of ['summarize', 'verify']) {
    const file = spawnSync(process.execPath, [cli, operation, '--input', 'examples/pass-request.json', '--root', root, '--json'], { encoding: 'utf8' });
    const stdin = spawnSync(process.execPath, [cli, operation, '--stdin', '--root', root, '--json'], { input: text, encoding: 'utf8' });
    assert.equal(file.status, 0, file.stderr); assert.equal(stdin.status, 0, stdin.stderr);
    const api = (operation === 'verify' ? verifyEvidence : summarizeEvidence)(bundle(f));
    assert.deepEqual(JSON.parse(file.stdout), api); assert.deepEqual(JSON.parse(stdin.stdout), api);
  }
  for (const [args, input, code] of [
    [['verify', '--json'], '', 2], [['verify', '--stdin', '--input', 'x.json', '--json'], '', 2],
    [['verify', '--stdin', '--json'], '{"a":1,"a":2}', 2],
    [['verify', '--stdin', '--json'], Buffer.from([0xff]), 2],
    [['verify', '--input', '../outside.json', '--root', root, '--json'], '', 4],
    [['verify', '--stdin', '--root', root, '--json'], JSON.stringify({ ...f.request, runs: [] }), 3],
    [['capabilities', '--root', root, '--json'], '', 2],
    [['verify', '--stdin', '--json'], ' '.repeat(262145), 3],
    [['verify', '--input', 'absent.json', '--root', root, '--json'], '', 1],
  ]) {
    const out = spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });
    assert.equal(out.status, code, out.stdout); assert.equal(out.stdout.trim().split('\n').length, 1);
    assert.equal(JSON.parse(out.stdout).data, null); assert.equal(out.stderr, '');
  }
});
test('safe file boundary rejects traversal, directories, device aliases and junction escape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-evidence boundary # '));
  try {
    writeFileSync(join(dir, 'good.json'), '{}'); mkdirSync(join(dir, 'folder.json'));
    const admitted = readArtifact(dir, 'good.json', ['.json'], 4194304);
    assert.equal(admitted.bytes, 2);
    assert.equal(admitted.raw.buffer.byteLength, 3);
    for (const path of ['../outside.json', join(tmpdir(), 'outside.json'), 'folder.json', 'nul.json', 'x:stream.json']) {
      const out = spawnSync(process.execPath, [cli, 'verify', '--input', path, '--root', dir, '--json'], { encoding: 'utf8' });
      assert.ok([2, 4].includes(out.status), out.stdout);
    }
    symlinkSync(root, join(dir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => readArtifact(dir, 'escape/examples/pass.json', ['.json'], 1000), { code: 'UNSAFE_PATH' });
    assert.throws(() => readArtifact(dir, 'good.json', ['.json'], 1), { code: 'RESOURCE_LIMIT' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('descriptor-bound reader rejects substitution and mutation before returning bytes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-evidence race # '));
  try {
    for (const mode of ['replace-before-open', 'change-during-read', 'replace-during-read']) {
      const file = join(dir, 'evidence.json'); writeFileSync(file, '{}');
      const script = `import fs from 'node:fs'; import {syncBuiltinESMExports} from 'node:module';
        const file=${JSON.stringify(file)}, mode=${JSON.stringify(mode)};
        const {readArtifact}=await import(${JSON.stringify(inputUrl)});
        const open=fs.openSync,read=fs.readSync;let triggered=false,targetFd;
        fs.openSync=function(...a){const target=String(a[0]).toLowerCase()===file.toLowerCase();if(target&&mode==='replace-before-open'){fs.renameSync(file,file+'.old');fs.writeFileSync(file,'{ }');}const fd=open(...a);if(target)targetFd=fd;return fd};
        fs.readSync=function(...a){const n=read(...a);if(a[0]===targetFd&&!triggered){triggered=true;if(mode==='change-during-read')fs.writeFileSync(file,'{ }');if(mode==='replace-during-read'){fs.renameSync(file,file+'.old');fs.writeFileSync(file,'{ }');}}return n};
        syncBuiltinESMExports();
        try{readArtifact(${JSON.stringify(dir)},'evidence.json',['.json'],100);process.exitCode=9}catch(e){console.log(e.code)}`;
      const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8', timeout: 10000 });
      assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /UNSAFE_PATH|INPUT_CHANGED/);
      rmSync(file + '.old', { force: true });
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('FIFO rejected without blocking on platforms with mkfifo', { skip: process.platform === 'win32' ? 'Windows has no POSIX FIFO fixture' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-evidence fifo '));
  try {
    const made = spawnSync('mkfifo', [join(dir, 'pipe.json')]); assert.equal(made.status, 0);
    assert.throws(() => readArtifact(dir, 'pipe.json', ['.json'], 100), { code: 'UNSAFE_PATH' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
