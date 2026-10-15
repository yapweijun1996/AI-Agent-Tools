import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { AngitError } from './shared.js';
import type { FileIdentity, OwnerContext, PlatformAdapter } from './shared.js';
import { parseJson } from './json.js';

const VERSION = 'angit-native/v1';
const MAX_FRAME = 65_536;
const MAX_PATH = 4096;
type Operation = 'ownerContext' | 'identify' | 'preparePrivateDirectory' | 'assertPrivateDirectory' | 'assertPrivateFile';
const NATIVE_ERRORS: Record<string, string> = {
  UNSUPPORTED_PLATFORM: 'Windows x64 is required.',
  INVALID_NATIVE_REQUEST: 'Native metadata request is invalid.',
  INVALID_PATH: 'An absolute ordinary Windows path is required.',
  PATH_NOT_FOUND: 'The requested filesystem object does not exist.',
  ACCESS_DENIED: 'Filesystem metadata access was denied.',
  INSECURE_STATE: 'Owner-only local state protection is required.',
  UNSUPPORTED_FILESYSTEM: 'A local fixed NTFS or ReFS filesystem is required.',
  NATIVE_IO_ERROR: 'Native filesystem metadata inspection failed.',
};

function platformError(code: string, message: string, exitCode?: number): never {
  throw new AngitError(code, message, exitCode);
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function ordinaryPath(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 3 || value.length > MAX_PATH || /[\uD800-\uDFFF]/u.test(value)) return false;
  if (!/^[a-z]:[\\/]/i.test(value) || /[\x00-\x1f\x7f-\x9f"<>|?*]/u.test(value) || value.slice(2).includes(':')) return false;
  const parts = value.slice(3).replaceAll('/', '\\').split('\\');
  return parts.every((part, index) => {
    if (!part) return index === parts.length - 1;
    if (part === '.' || part === '..' || /[. ]$/u.test(part)) return false;
    const stem = part.split('.')[0]!;
    return !/^(?:CON|PRN|AUX|NUL|CLOCK\$|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9\u00b9\u00b2\u00b3])$/i.test(stem);
  });
}
function sid(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 184 && /^S-1-(?:[0-9]+-)*[0-9]+$/u.test(value);
}
function boundedAsset(path: string, maxBytes: number): Buffer {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.size <= 0n || before.size > BigInt(maxBytes)) {
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native asset identity is invalid.');
    }
    descriptor = openSync(path, 'r');
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || before.dev !== opened.dev || before.ino !== opened.ino || before.size !== opened.size) {
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native asset changed during inspection.');
    }
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = readSync(descriptor, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (size !== Number(opened.size) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) {
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native asset changed during inspection.');
    }
    return buffer.subarray(0, size);
  } catch (error) {
    if (error instanceof AngitError) throw error;
    return platformError('NATIVE_HELPER_UNAVAILABLE', 'The precompiled packaged native helper is unavailable.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
function digest(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

/** Fixed packaged executable boundary; task/repository paths are stdin data, never executables. */
export function createNativePlatform(assetRoot: string): PlatformAdapter {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    return platformError('UNSUPPORTED_PLATFORM', 'Windows x64 is required.', 3);
  }
  const executable = join(assetRoot, 'dist', 'native', 'platform.exe');
  const identityPath = join(assetRoot, 'dist', 'native', 'platform.identity.json');
  const source = join(assetRoot, 'native', 'Platform.cs');

  function verifyPackage(): string {
    let identity: unknown;
    try { identity = parseJson(boundedAsset(identityPath, 4096), 4096); }
    catch (error) {
      if (error instanceof AngitError && error.code === 'NATIVE_HELPER_UNAVAILABLE') throw error;
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native build identity is invalid.');
    }
    if (!record(identity) || !exactKeys(identity, ['schemaVersion', 'platform', 'compiler', 'references', 'sourceSha256', 'exeSha256']) ||
      identity.schemaVersion !== 'angit-native-build/v1' || identity.platform !== 'win32-x64' || identity.compiler !== 'framework64-csc' ||
      !Array.isArray(identity.references) || identity.references.length !== 2 || identity.references[0] !== 'mscorlib.dll' || identity.references[1] !== 'System.dll' ||
      typeof identity.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(identity.sourceSha256) ||
      typeof identity.exeSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(identity.exeSha256)) {
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native build identity is invalid.');
    }
    if (digest(boundedAsset(source, 262_144)) !== identity.sourceSha256 || digest(boundedAsset(executable, 4_194_304)) !== identity.exeSha256) {
      return platformError('NATIVE_IDENTITY_MISMATCH', 'Packaged native source/binary digest does not match.');
    }
    return identity.exeSha256;
  }

  function invoke(op: Operation, path?: string): Record<string, unknown> {
    if (op !== 'ownerContext' && !ordinaryPath(path)) return platformError('INVALID_PATH', NATIVE_ERRORS.INVALID_PATH!);
    const pairedDigest = verifyPackage();
    const requestId = randomBytes(16).toString('hex');
    const input = Buffer.from(JSON.stringify({ schemaVersion: VERSION, requestId, op, ...(path === undefined ? {} : { path }) }), 'utf8');
    if (input.length > MAX_FRAME) return platformError('INVALID_NATIVE_REQUEST', NATIVE_ERRORS.INVALID_NATIVE_REQUEST!);
    const child = spawnSync(executable, ['--stdio-v1'], {
      input, shell: false, windowsHide: true, timeout: 10_000, maxBuffer: MAX_FRAME,
      cwd: assetRoot, env: {}, stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (child.error) {
      const code = (child.error as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT') return platformError('NATIVE_TIMEOUT', 'Native metadata inspection exceeded its deadline.');
      if (code === 'ENOBUFS') return platformError('NATIVE_OUTPUT_LIMIT', 'Native metadata output exceeded its bound.');
      return platformError('NATIVE_HELPER_UNAVAILABLE', 'The packaged native helper could not be started.');
    }
    if (child.signal !== null || child.stderr.length !== 0 || child.stdout.length === 0 || child.stdout.length > MAX_FRAME ||
      child.stdout[child.stdout.length - 1] !== 10 || child.stdout.subarray(0, -1).includes(10) || child.stdout.includes(13)) {
      return platformError('NATIVE_PROTOCOL_ERROR', 'Native metadata response framing is invalid.');
    }
    if (verifyPackage() !== pairedDigest) return platformError('NATIVE_IDENTITY_MISMATCH', 'Native build identity changed during inspection.');
    let response: unknown;
    try { response = parseJson(child.stdout, MAX_FRAME); }
    catch { return platformError('NATIVE_PROTOCOL_ERROR', 'Native metadata response is invalid UTF-8 or JSON.'); }
    if (!record(response) || response.schemaVersion !== VERSION || response.requestId !== requestId || response.op !== op || typeof response.ok !== 'boolean') {
      return platformError('NATIVE_PROTOCOL_ERROR', 'Native metadata response does not match the request.');
    }
    if (!response.ok) {
      if (!exactKeys(response, ['schemaVersion', 'requestId', 'op', 'ok', 'code', 'message']) || typeof response.code !== 'string' ||
        !Object.hasOwn(NATIVE_ERRORS, response.code) || response.message !== NATIVE_ERRORS[response.code] || child.status !== (response.code === 'UNSUPPORTED_PLATFORM' ? 3 : 2)) {
        return platformError('NATIVE_PROTOCOL_ERROR', 'Native metadata error response is invalid.');
      }
      return platformError(response.code, NATIVE_ERRORS[response.code]!, response.code === 'UNSUPPORTED_PLATFORM' ? 3 : undefined);
    }
    if (child.status !== 0 || !exactKeys(response, ['schemaVersion', 'requestId', 'op', 'ok', 'result']) || !record(response.result)) {
      return platformError('NATIVE_PROTOCOL_ERROR', 'Native metadata success response is invalid.');
    }
    return response.result;
  }

  function file(op: Exclude<Operation, 'ownerContext'>, path: string): FileIdentity {
    const value = invoke(op, path);
    if (!exactKeys(value, ['canonicalPath', 'identity', 'ownerSid', 'directory', 'reparsePoint', 'localDisk']) ||
      !ordinaryPath(value.canonicalPath) || typeof value.identity !== 'string' || !/^win:[0-9a-f]{16}:[0-9a-f]{32}$/u.test(value.identity) ||
      !sid(value.ownerSid) || typeof value.directory !== 'boolean' || typeof value.reparsePoint !== 'boolean' || typeof value.localDisk !== 'boolean') {
      return platformError('NATIVE_PROTOCOL_ERROR', 'Native filesystem identity shape is invalid.');
    }
    if (op !== 'identify' && (!value.localDisk || value.reparsePoint || value.directory !== (op === 'preparePrivateDirectory' || op === 'assertPrivateDirectory'))) {
      return platformError('NATIVE_PROTOCOL_ERROR', 'Native private-object protection response is invalid.');
    }
    return { canonicalPath: value.canonicalPath, identity: value.identity, ownerSid: value.ownerSid,
      directory: value.directory, reparsePoint: value.reparsePoint, localDisk: value.localDisk };
  }

  return {
    ownerContext(): OwnerContext {
      const value = invoke('ownerContext');
      if (!exactKeys(value, ['sid', 'stateRoot']) || !sid(value.sid) || !ordinaryPath(value.stateRoot) || win32.basename(value.stateRoot) !== 'angit') {
        return platformError('NATIVE_PROTOCOL_ERROR', 'Native owner context shape is invalid.');
      }
      return { sid: value.sid, stateRoot: value.stateRoot };
    },
    identify: path => file('identify', path),
    preparePrivateDirectory: path => file('preparePrivateDirectory', path),
    assertPrivateDirectory: path => file('assertPrivateDirectory', path),
    assertPrivateFile: path => file('assertPrivateFile', path),
  };
}
