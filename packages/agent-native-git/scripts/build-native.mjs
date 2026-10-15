import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FRAMEWORK = 'C:/Windows/Microsoft.NET/Framework64/v4.0.30319';
const REFERENCES = ['mscorlib.dll', 'System.dll'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/**
 * Explicit owner/developer build. Importing this module performs no compilation or mutation.
 * @param {string} root Trusted package root.
 * @returns {void}
 */
export function buildNative(root) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('UNSUPPORTED_PLATFORM: Windows x64 native build required.');
  if (typeof root !== 'string' || !root || /[\x00-\x1f"\r\n]/u.test(root)) throw new Error('INVALID_BUILD_ROOT: A trusted local package root is required.');
  root = resolve(root);
  const compiler = join(FRAMEWORK, 'csc.exe');
  const sources = [join(root, 'native', 'Platform.cs'), join(root, 'native', 'Execution.cs')];
  const references = [...REFERENCES, 'System.Core.dll'];
  for (const path of [compiler, ...sources, ...references.map(name => join(FRAMEWORK, name))]) {
    if (!existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) {
      throw new Error('NATIVE_BUILD_UNAVAILABLE: Fixed local Framework64 compiler, references and owned source must exist; no fallback or download.');
    }
  }
  const sourceBytes = sources.map(source => readFileSync(source));
  if (sourceBytes.some(bytes => !bytes.length || bytes.length > 262_144)) throw new Error('NATIVE_BUILD_INPUT_INVALID: Owned native source exceeds its bound.');
  const output = join(root, 'dist', 'native');
  mkdirSync(output, { recursive: true });
  const nonce = randomBytes(12).toString('hex');
  for (const kind of ['platform', 'execution']) {
  const temporaryExe = join(output, `.${kind}-${nonce}.exe`);
  const temporaryIdentity = join(output, `.${kind}-${nonce}.json`);
  const inputs = kind === 'platform' ? [sources[0]] : sources;
  const usedReferences = kind === 'platform' ? REFERENCES : references;
  try {
    const compilation = spawnSync(compiler, [
      '/noconfig', '/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/optimize+', '/debug-',
      `/main:${kind === 'platform' ? 'Platform' : 'Execution'}`,
      `/out:${temporaryExe}`, ...usedReferences.map(name => `/reference:${join(FRAMEWORK, name)}`), ...inputs,
    ], { shell: false, windowsHide: true, timeout: 15_000, maxBuffer: 262_144, cwd: root, env: {} });
    if (compilation.error || compilation.signal !== null || compilation.status !== 0) {
      const details = Buffer.concat([compilation.stdout ?? Buffer.alloc(0), compilation.stderr ?? Buffer.alloc(0)]).toString('utf8');
      throw new Error(`NATIVE_BUILD_FAILED: Fixed Framework64 compilation failed${compilation.error ? ` (${compilation.error.code ?? 'start failure'})` : ''}.\n${details}`);
    }
    const exe = readFileSync(temporaryExe);
    const peOffset = exe.length >= 64 ? exe.readUInt32LE(0x3c) : 0;
    if (exe.length > 4_194_304 || exe.length < 64 || exe[0] !== 0x4d || exe[1] !== 0x5a || peOffset < 64 || peOffset + 24 > exe.length ||
      exe.readUInt32LE(peOffset) !== 0x00004550 || exe.readUInt16LE(peOffset + 4) !== 0x8664) {
      throw new Error('NATIVE_BUILD_OUTPUT_INVALID: Compilation did not produce the expected bounded x64 PE executable.');
    }
    if (sources.some((source, index) => hash(readFileSync(source)) !== hash(sourceBytes[index]))) throw new Error('NATIVE_BUILD_INPUT_CHANGED: Owned source changed during compilation.');
    const identity = kind === 'platform'
      ? { schemaVersion: 'angit-native-build/v1', platform: 'win32-x64', compiler: 'framework64-csc', references: REFERENCES, sourceSha256: hash(sourceBytes[0]), exeSha256: hash(exe) }
      : { schemaVersion: 'angit-execution-build/v1', platform: 'win32-x64', compiler: 'framework64-csc', references: usedReferences,
        sources: { 'Platform.cs': hash(sourceBytes[0]), 'Execution.cs': hash(sourceBytes[1]) }, exeSha256: hash(exe) };
    writeFileSync(temporaryIdentity, `${JSON.stringify(identity)}\n`, { encoding: 'utf8', flag: 'wx' });
    // A crash between these renames leaves a mismatched pair that the runtime rejects, never a fallback.
    renameSync(temporaryExe, join(output, `${kind}.exe`));
    renameSync(temporaryIdentity, join(output, `${kind}.identity.json`));
  } finally {
    rmSync(temporaryExe, { force: true });
    rmSync(temporaryIdentity, { force: true });
  }
  }
}
