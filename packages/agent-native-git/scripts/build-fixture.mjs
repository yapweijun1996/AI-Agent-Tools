import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRAMEWORK = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319';
const REFERENCES = ['mscorlib.dll', 'System.dll'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Importing this module never compiles. The parent must select this explicit test build.
export function buildExecutionFixture(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Windows x64 is required for the inert fixture build.');
  if (typeof root !== 'string' || !root || /[\x00-\x1f"\r\n]/u.test(root)) throw new Error('A trusted local test source root is required.');
  root = resolve(root);
  const source = join(root, 'native/fixtures/ExecutionFixture.cs');
  const compiler = join(FRAMEWORK, 'csc.exe');
  for (const path of [source, compiler, ...REFERENCES.map(name => join(FRAMEWORK, name))]) {
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Fixed Framework64 compiler/references and owned fixture source required; no download or fallback.');
  }
  const sourceBytes = readFileSync(source);
  if (!sourceBytes.length || sourceBytes.length > 262144) throw new Error('Fixture source exceeds the approved build bound.');
  const output = join(root, 'tests/.native');
  mkdirSync(output, { recursive: true });
  const nonce = randomBytes(12).toString('hex');
  const exe = join(output, `.execution-fixture-${nonce}.exe`);
  const identityFile = join(output, `.execution-fixture-${nonce}.json`);
  try {
    const compiled = spawnSync(compiler, ['/noconfig', '/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/optimize+', '/debug-',
      `/out:${exe}`, ...REFERENCES.map(name => `/reference:${join(FRAMEWORK, name)}`), source],
    { cwd: root, shell: false, windowsHide: true, timeout: 15000, maxBuffer: 262144, env: {} });
    if (compiled.error || compiled.signal !== null || compiled.status !== 0) {
      const detail = Buffer.concat([compiled.stdout ?? Buffer.alloc(0), compiled.stderr ?? Buffer.alloc(0)]).toString('utf8');
      throw new Error(`Explicit inert fixture build failed: ${compiled.error?.code ?? compiled.status}\n${detail}`);
    }
    const bytes = readFileSync(exe), pe = bytes.length >= 64 ? bytes.readUInt32LE(0x3c) : 0;
    if (bytes.length < 64 || bytes.length > 4194304 || bytes[0] !== 0x4d || bytes[1] !== 0x5a || pe < 64 || pe + 24 > bytes.length ||
      bytes.readUInt32LE(pe) !== 0x00004550 || bytes.readUInt16LE(pe + 4) !== 0x8664) throw new Error('Fixture compiler did not produce a bounded x64 PE.');
    if (sha256(readFileSync(source)) !== sha256(sourceBytes)) throw new Error('Fixture source changed during the explicit build.');
    const identity = { schemaVersion: 'angit-execution-fixture-build/v1', platform: 'win32-x64', compiler: 'framework64-csc',
      references: REFERENCES, sourceSha256: sha256(sourceBytes), exeSha256: sha256(bytes) };
    writeFileSync(identityFile, JSON.stringify(identity) + '\n', { flag: 'wx' });
    renameSync(exe, join(output, 'execution-fixture.exe'));
    renameSync(identityFile, join(output, 'execution-fixture.identity.json'));
    return identity;
  } finally {
    rmSync(exe, { force: true }); rmSync(identityFile, { force: true });
  }
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length !== 3 || process.argv[2] !== '--explicit-test-build') throw new Error('Fixture compilation requires --explicit-test-build; no install hook.');
  buildExecutionFixture(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
}
