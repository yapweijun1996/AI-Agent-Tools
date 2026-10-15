import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs';
import { join, win32 } from 'node:path';
import { canonical, parseFrameJson, parseJson } from './json.js';
import { createNativePlatform } from './platform.js';
import { AngitError } from './shared.js';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

export interface BrokerDescriptor {
  pipeName: string;
  scopeHandle: string;
  ownerSid: string;
  projectId: string;
  authorityIncarnation: string;
  coordinatorEpoch: number;
}
export interface BrokerRequest {
  requestId: string;
  peerSid: string;
  clientPid: number;
  clientStartIdentity: string;
  request: unknown;
}
export interface BrokerHandle { close(): Promise<void> }
export interface ExecutionAuthority {
  projectId: string;
  authorityIncarnation: string;
  coordinatorEpoch: number;
  resourceKey: string;
  fencingToken: number;
  ownerId: string;
}
export interface SupervisionSpec {
  executable: string;
  executableHash: string;
  args: string[];
  input: string;
  cwd: string;
  environment: Record<string, string>;
  supervisorId: string;
  launchIdentity: string;
  authority: ExecutionAuthority;
  budget: { timeoutMs: number; maxOutputBytes: number; maxProcesses: number; heartbeatMs: number; stopTimeoutMs: number };
  artifactDirectory: string;
}
export interface ProcessReceipt {
  supervisorId: string;
  launchIdentity: string;
  pid: number;
  startIdentity: string;
  executableHash: string;
  descendantScopeHash: string;
}
export interface ArtifactReceipt { path: string; bytes: number; sha256: string }
export interface TerminationReceipt {
  process: ProcessReceipt;
  authority: ExecutionAuthority;
  writerTreeTerminated: true;
  rootExitCode: number;
  observedAtMs: number;
  terminationReceiptHash: string;
  reason: 'exit' | 'stop' | 'timeout' | 'output_limit' | 'parent_eof' | 'control_loss' | 'heartbeat' | 'start_callback_failure';
  stopOperationId: string | null;
  stdout: ArtifactReceipt;
  stderr: ArtifactReceipt;
  receiptPath: string;
  helperHash: string;
  helperProcess: { pid: number; startIdentity: string; instanceName: string };
  receiptMac: string;
}
export interface SupervisionHandle {
  completion: Promise<TerminationReceipt>;
  pulse(): Promise<void>;
  resume(): Promise<void>;
  stop(stopOperationId: string): Promise<void>;
}
export interface SupervisionCallbacks { started(process: ProcessReceipt): Promise<void> }

const MAX_FRAME = 2_097_152;
const MAX_LAUNCH_FRAME = 8_388_608;
const NATIVE_ERRORS: Record<string, string> = {
  UNSUPPORTED_PLATFORM: 'Windows x64 is required.',
  INVALID_NATIVE_REQUEST: 'Native execution request is invalid.',
  NATIVE_PROTOCOL_ERROR: 'Native execution framing or identity is invalid.',
  NATIVE_EXECUTION_UNKNOWN: 'Native execution outcome is unknown; retain ownership for reconciliation.',
  EXECUTABLE_DENIED: 'An approved non-shell executable is required.',
  EXECUTABLE_IDENTITY_MISMATCH: 'The approved executable identity changed.',
  BROKER_BIND_DENIED: 'The owner-scoped broker namespace is unavailable.',
  BROKER_PEER_DENIED: 'The broker peer identity was denied.',
  BROKER_SCOPE_DENIED: 'The broker scope or authority binding was denied.',
  BROKER_REQUEST_DENIED: 'The owner-scoped broker request was denied.',
};
const REASONS: Record<string, true> = { exit: true, stop: true, timeout: true, output_limit: true, parent_eof: true, control_loss: true, heartbeat: true, start_callback_failure: true };
function failure(code = 'NATIVE_PROTOCOL_ERROR'): AngitError {
  return new AngitError(code, NATIVE_ERRORS[code] ?? 'Native execution failed without a known termination outcome.');
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function hex(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }
function integer(value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum; }
function digest(value: Uint8Array | string): string { return createHash('sha256').update(value).digest('hex'); }
function boundedFile(path: string, limit: number): Buffer {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.size < 0n || before.size > BigInt(limit)) throw failure('NATIVE_EXECUTION_UNKNOWN');
    descriptor = openSync(path, 'r');
    const opened = fstatSync(descriptor, { bigint: true });
    if (before.dev !== opened.dev || before.ino !== opened.ino || before.size !== opened.size) throw failure('NATIVE_EXECUTION_UNKNOWN');
    const bytes = Buffer.alloc(Number(opened.size) + 1);
    let at = 0;
    while (at < bytes.length) { const count = readSync(descriptor, bytes, at, bytes.length - at, null); if (!count) break; at += count; }
    const after = fstatSync(descriptor, { bigint: true });
    if (at !== Number(opened.size) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs) throw failure('NATIVE_EXECUTION_UNKNOWN');
    return bytes.subarray(0, at);
  } catch (error) { if (error instanceof AngitError) throw error; throw failure('NATIVE_EXECUTION_UNKNOWN'); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function pairedHelper(assetRoot: string): { executable: string; hash: string } {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw failure('UNSUPPORTED_PLATFORM');
  const executable = join(assetRoot, 'dist', 'native', 'execution.exe');
  let identity: unknown;
  try { identity = parseJson(boundedFile(join(assetRoot, 'dist', 'native', 'execution.identity.json'), 4096), 4096); }
  catch { throw new AngitError('NATIVE_HELPER_UNAVAILABLE', 'The fixed packaged execution helper is unavailable.'); }
  if (!object(identity) || !keys(identity, ['schemaVersion', 'platform', 'compiler', 'references', 'sources', 'exeSha256']) ||
    identity.schemaVersion !== 'angit-execution-build/v1' || identity.platform !== 'win32-x64' || identity.compiler !== 'framework64-csc' ||
    JSON.stringify(identity.references) !== JSON.stringify(['mscorlib.dll', 'System.dll', 'System.Core.dll']) ||
    !object(identity.sources) || !keys(identity.sources, ['Platform.cs', 'Execution.cs']) || !hex(identity.exeSha256)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Packaged execution pairing is invalid.');
  for (const source of ['Platform.cs', 'Execution.cs']) if (!hex(identity.sources[source]) || digest(boundedFile(join(assetRoot, 'native', source), 262_144)) !== identity.sources[source]) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Packaged execution source identity changed.');
  if (digest(boundedFile(executable, 4_194_304)) !== identity.exeSha256) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Packaged execution binary identity changed.');
  return { executable, hash: identity.exeSha256 };
}
function frame(value: unknown, limit: number): Buffer {
  let json: string;
  try { json = canonical(value); } catch { throw failure('INVALID_NATIVE_REQUEST'); }
  const bytes = Buffer.from(json, 'utf8');
  if (!bytes.length || bytes.length > limit) throw failure('INVALID_NATIVE_REQUEST');
  // Native envelopes include escaped task input; their transport bound is separate from CLI JSON input.
  const output = Buffer.allocUnsafe(bytes.length + 4); output.writeUInt32BE(bytes.length); bytes.copy(output, 4); return output;
}

/** Fixed owned helper transport. EOF, never PID termination, is the cleanup signal on protocol loss. */
class NativeSession {
  readonly child: ChildProcessWithoutNullStreams;
  readonly exited: Promise<void>;
  private exitedResolve!: () => void;
  private failed = false;
  private inboundError: AngitError | undefined;
  private outboundError: AngitError | undefined;
  private header = Buffer.alloc(4);
  private headerAt = 0;
  private body: Buffer | undefined;
  private bodyAt = 0;
  private writeChain: Promise<void> = Promise.resolve();
  constructor(assetRoot: string, mode: '--broker-v1' | '--client-v1' | '--supervisor-v1' | '--receipt-v1',
    readonly onFrame: (frame: Record<string, unknown>) => void, readonly onFailure: (error: AngitError) => void,
    readonly onOutboundFailure: (error: AngitError) => void = onFailure) {
    const helper = pairedHelper(assetRoot);
    // libuv otherwise kills this helper with the Node parent's Windows Job before EOF proof can persist.
    // Keep referenced stdio and foreground completion; only the supervisor owns the provider Job lifetime.
    this.child = spawn(helper.executable, [mode], { shell: false, windowsHide: true, detached: mode === '--supervisor-v1', cwd: assetRoot, env: {}, stdio: ['pipe', 'pipe', 'pipe'] });
    const exit = Promise.withResolvers<void>();
    this.exited = exit.promise; this.exitedResolve = exit.resolve;
    this.child.on('error', () => this.fail(new AngitError('NATIVE_HELPER_UNAVAILABLE', 'The fixed execution helper could not start.')));
    this.child.stdin.on('error', () => this.loseOutbound(failure('NATIVE_EXECUTION_UNKNOWN')));
    this.child.stdout.on('error', () => this.fail(failure('NATIVE_EXECUTION_UNKNOWN')));
    this.child.stderr.on('data', () => this.fail(failure()));
    this.child.stdout.on('data', (chunk: Buffer) => {
      try {
        let at = 0;
        while (at < chunk.length && !this.failed) {
          if (!this.body) {
            const count = Math.min(4 - this.headerAt, chunk.length - at); chunk.copy(this.header, this.headerAt, at, at + count); this.headerAt += count; at += count;
            if (this.headerAt !== 4) continue;
            const length = this.header.readUInt32BE(); if (length < 1 || length > MAX_FRAME) throw failure();
            this.body = Buffer.allocUnsafe(length); this.bodyAt = 0; this.headerAt = 0;
          }
          const count = Math.min(this.body.length - this.bodyAt, chunk.length - at); chunk.copy(this.body, this.bodyAt, at, at + count); at += count; this.bodyAt += count;
          if (this.bodyAt === this.body.length) {
            const value = parseFrameJson(this.body); this.body = undefined;
            if (!object(value) || typeof value.type !== 'string') throw failure();
            if (value.type === 'error') { if (!keys(value, ['type', 'code']) || typeof value.code !== 'string' || !Object.hasOwn(NATIVE_ERRORS, value.code)) throw failure(); this.fail(failure(value.code)); }
            else this.onFrame(value);
          }
        }
      } catch (error) { this.fail(error instanceof AngitError ? error : failure()); }
    });
    this.child.on('close', (code, signal) => {
      if (this.body || this.headerAt || code !== 0 || signal !== null) this.fail(failure('NATIVE_EXECUTION_UNKNOWN'));
      this.exitedResolve();
    });
  }
  get protocolFailure(): AngitError | undefined { return this.inboundError; }
  get outboundFailure(): AngitError | undefined { return this.outboundError; }
  private fail(error: AngitError): void { if (this.failed) return; this.failed = true; this.inboundError = error; this.child.stdin.end(); this.onFailure(error); }
  private loseOutbound(error: AngitError): void {
    if (this.outboundError) return;
    this.outboundError = error; this.child.stdin.end(); this.onOutboundFailure(error);
  }
  send(value: unknown, limit = MAX_FRAME, obsolete?: () => boolean): Promise<void> {
    const bytes = frame(value, limit);
    const sent = this.writeChain.then(() => {
      if (obsolete?.()) return;
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      if (this.failed) reject(this.inboundError);
      else if (this.outboundError || this.child.stdin.destroyed || this.child.stdin.writableEnded) {
        const error = this.outboundError ?? failure('NATIVE_EXECUTION_UNKNOWN'); this.loseOutbound(error); reject(error);
      } else {
        try {
          this.child.stdin.write(bytes, error => {
            if (error) { const lost = failure('NATIVE_EXECUTION_UNKNOWN'); this.loseOutbound(lost); reject(lost); }
            else resolve();
          });
        } catch { const error = failure('NATIVE_EXECUTION_UNKNOWN'); this.loseOutbound(error); reject(error); }
      }
      return promise;
    });
    // A failed write is never replayed; later controls still get their execution-time obsolescence check.
    this.writeChain = sent.catch(() => undefined);
    return sent;
  }
  end(): void { this.child.stdin.end(); }
}

export async function startBroker(assetRoot: string, descriptor: BrokerDescriptor, handler: (request: BrokerRequest) => Promise<unknown>): Promise<BrokerHandle> {
  const { promise: readiness, resolve: resolveReady, reject: rejectReady } = Promise.withResolvers<BrokerHandle>();
  void readiness.catch(() => undefined);
  let ready = false, closed = false, handlerPending: Promise<void> = Promise.resolve();
  const session = new NativeSession(assetRoot, '--broker-v1', value => {
    if (value.type === 'ready' && keys(value, ['type']) && !ready && !closed) { ready = true; resolveReady(handle); return; }
    if (value.type !== 'request' || !ready || closed || !keys(value, ['type', 'requestId', 'peerSid', 'clientPid', 'clientStartIdentity', 'request']) ||
      !hex(value.requestId) || value.peerSid !== descriptor.ownerSid || !integer(value.clientPid, 1, 0xffffffff) || !hex(value.clientStartIdentity)) throw failure();
    const request: BrokerRequest = { requestId: value.requestId, peerSid: descriptor.ownerSid, clientPid: value.clientPid, clientStartIdentity: value.clientStartIdentity, request: value.request };
    handlerPending = handlerPending.then(async () => {
      if (closed) return;
      let reply: unknown;
      try { reply = await handler(request); }
      catch (error) { reply = { ok: false, code: error instanceof AngitError ? error.code : 'BROKER_REQUEST_DENIED', message: 'The coordinator request was denied.' }; }
      if (!closed) await session.send({ op: 'reply', requestId: request.requestId, reply });
    }).catch(() => { closed = true; session.end(); });
  }, error => { closed = true; rejectReady(error); });
  const handle: BrokerHandle = { async close() { if (!closed) { closed = true; await session.send({ op: 'close' }).catch(() => undefined); session.end(); } await handlerPending; await session.exited; } };
  const timer = setTimeout(() => { closed = true; session.end(); rejectReady(failure('BROKER_BIND_DENIED')); }, 10_000);
  void session.exited.then(() => { closed = true; if (!ready) rejectReady(failure('BROKER_BIND_DENIED')); });
  try { await session.send({ descriptor }); return await readiness; }
  finally { clearTimeout(timer); }
}

export async function callBroker(assetRoot: string, descriptor: BrokerDescriptor, request: unknown): Promise<unknown> {
  let result: unknown, received = false;
  const { promise: reply, resolve: resolveReply, reject: rejectReply } = Promise.withResolvers<void>();
  void reply.catch(() => undefined);
  const session = new NativeSession(assetRoot, '--client-v1', value => {
    if (received || value.type !== 'reply' || !keys(value, ['type', 'reply'])) throw failure(); result = value.reply; received = true; resolveReply();
  }, rejectReply);
  const timer = setTimeout(() => { session.end(); rejectReply(failure('BROKER_REQUEST_DENIED')); }, 40_000);
  void session.exited.then(() => { if (!received) rejectReply(failure('BROKER_REQUEST_DENIED')); });
  try { await session.send({ descriptor, request }); await reply; session.end(); await session.exited; return result; }
  finally { clearTimeout(timer); session.end(); }
}

function processReceipt(value: unknown, spec: SupervisionSpec, errorCode = 'NATIVE_PROTOCOL_ERROR'): ProcessReceipt {
  if (!object(value) || !keys(value, ['supervisorId', 'launchIdentity', 'pid', 'startIdentity', 'executableHash', 'descendantScopeHash']) ||
    value.supervisorId !== spec.supervisorId || value.launchIdentity !== spec.launchIdentity || !integer(value.pid, 1, 0xffffffff) ||
    !hex(value.startIdentity) || value.executableHash !== spec.executableHash || !hex(value.descendantScopeHash)) throw failure(errorCode);
  return value as unknown as ProcessReceipt;
}
function sameAuthority(value: unknown, expected: ExecutionAuthority): boolean {
  return object(value) && keys(value, ['projectId', 'authorityIncarnation', 'coordinatorEpoch', 'resourceKey', 'fencingToken', 'ownerId']) &&
    Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue);
}
function terminationReceipt(value: unknown, spec: SupervisionSpec, process: ProcessReceipt, helperHash: string): TerminationReceipt {
  if (!object(value) || !keys(value, ['process', 'authority', 'writerTreeTerminated', 'rootExitCode', 'observedAtMs', 'reason', 'stopOperationId', 'stdout', 'stderr', 'receiptPath', 'helperHash', 'helperProcess', 'terminationReceiptHash', 'receiptMac']) ||
    !sameAuthority(value.authority, spec.authority) || value.writerTreeTerminated !== true || !integer(value.rootExitCode, 0, 0xffffffff) || !integer(value.observedAtMs) ||
    typeof value.reason !== 'string' || !Object.hasOwn(REASONS, value.reason) || !(value.stopOperationId === null || typeof value.stopOperationId === 'string') ||
    value.receiptPath !== win32.join(spec.artifactDirectory, 'termination.json') || value.helperHash !== helperHash || !hex(value.terminationReceiptHash) || !hex(value.receiptMac) ||
    !object(value.helperProcess) || !keys(value.helperProcess, ['pid', 'startIdentity', 'instanceName']) || !integer(value.helperProcess.pid, 1, 0xffffffff) || !hex(value.helperProcess.startIdentity) || typeof value.helperProcess.instanceName !== 'string') throw failure('NATIVE_EXECUTION_UNKNOWN');
  const observed = processReceipt(value.process, spec, 'NATIVE_EXECUTION_UNKNOWN');
  if (Object.entries(process).some(([key, expected]) => (observed as unknown as Record<string, unknown>)[key] !== expected)) throw failure('NATIVE_EXECUTION_UNKNOWN');
  for (const name of ['stdout', 'stderr']) {
    const artifact = value[name];
    if (!object(artifact) || !keys(artifact, ['path', 'bytes', 'sha256']) || artifact.path !== win32.join(spec.artifactDirectory, `${name}.bin`) || !integer(artifact.bytes, 0, spec.budget.maxOutputBytes) || !hex(artifact.sha256)) throw failure('NATIVE_EXECUTION_UNKNOWN');
  }
  if ((value.stdout as unknown as ArtifactReceipt).bytes + (value.stderr as unknown as ArtifactReceipt).bytes > spec.budget.maxOutputBytes) throw failure('NATIVE_EXECUTION_UNKNOWN');
  const { terminationReceiptHash, receiptMac: _receiptMac, ...unsigned } = value;
  if (digest(JSON.stringify(unsigned)) !== terminationReceiptHash) throw failure('NATIVE_EXECUTION_UNKNOWN');
  return value as unknown as TerminationReceipt;
}

export async function startSupervision(assetRoot: string, spec: SupervisionSpec, callbacks: SupervisionCallbacks): Promise<SupervisionHandle> {
  if (typeof spec.input !== 'string' || Buffer.byteLength(spec.input, 'utf8') > 1_048_576) throw failure('INVALID_NATIVE_REQUEST');
  const helperHash = pairedHelper(assetRoot).hash, controlNonce = randomBytes(32).toString('hex');
  const { promise: started, resolve: resolveStart, reject: rejectStart } = Promise.withResolvers<SupervisionHandle>();
  const { promise: completion, resolve: resolveCompletion, reject: rejectCompletion } = Promise.withResolvers<TerminationReceipt>();
  // Admission may fail before the caller receives its handle; retain rejection without an unhandled promise.
  void completion.catch(() => undefined);
  void started.catch(() => undefined);
  let process: ProcessReceipt | undefined, final: TerminationReceipt | undefined, callback: Promise<void> = Promise.resolve(), resumeSent = false, resumed = false, stopping = false;
  const session = new NativeSession(assetRoot, '--supervisor-v1', value => {
    if (value.type === 'started' && keys(value, ['type', 'process']) && !process) {
      process = processReceipt(value.process, spec);
      callback = Promise.resolve().then(() => callbacks.started(process!));
      resolveStart(handle);
      void callback.then(() => handle.resume(), async () => { stopping = true; await sendControl({ op: 'start_callback_failure', controlNonce }); }).catch(() => { session.end(); });
      return;
    }
    if (value.type === 'resumed' && keys(value, ['type']) && process && resumeSent && !resumed && !final) { resumed = true; return; }
    if (value.type === 'terminated' && keys(value, ['type', 'receipt']) && process && !final) { final = terminationReceipt(value.receipt, spec, process, helperHash); session.end(); return; }
    throw failure();
  }, error => { rejectStart(error); rejectCompletion(error); }, () => undefined);
  async function sendControl(value: unknown): Promise<void> {
    try { await session.send(value, MAX_FRAME, () => final !== undefined); }
    catch (error) {
      if (session.protocolFailure || !session.outboundFailure) throw error;
      // Delivery loss is not proof of an unknown writer. Wait for exact durable termination, never replay the control.
      await completion;
    }
  }
  const handle: SupervisionHandle = {
    completion,
    async pulse() { if (final) return; await sendControl({ op: 'pulse', controlNonce }); },
    async resume() {
      await callback;
      if (resumeSent || stopping || final) return;
      resumeSent = true;
      // The successful durable-start callback is fresh owner liveness. Refresh
      // the watchdog before resume rather than consuming its whole startup window.
      await sendControl({ op: 'pulse', controlNonce });
      if (!stopping && !final) await sendControl({ op: 'resume', controlNonce });
    },
    async stop(stopOperationId) { if (final) return; if (typeof stopOperationId !== 'string' || !/^[a-z0-9_:.-]{1,200}$/iu.test(stopOperationId)) throw failure('INVALID_NATIVE_REQUEST'); stopping = true; await sendControl({ op: 'stop', controlNonce, stopOperationId }); },
  };
  const timer = setTimeout(() => { session.end(); rejectStart(failure('NATIVE_EXECUTION_UNKNOWN')); }, 10_000);
  void session.exited.then(async () => {
    clearTimeout(timer);
    if (session.protocolFailure) throw session.protocolFailure;
    if (!process) throw failure('NATIVE_EXECUTION_UNKNOWN');
    if (!final || session.outboundFailure) {
      const receipt = await readTerminationReceipt(assetRoot, win32.join(spec.artifactDirectory, 'termination.json'), spec, process);
      if (final && (receipt.terminationReceiptHash !== final.terminationReceiptHash || receipt.receiptMac !== final.receiptMac)) throw failure('NATIVE_EXECUTION_UNKNOWN');
      final = receipt;
    }
    resolveCompletion(final);
  }).catch(error => { rejectStart(error); rejectCompletion(error); });
  try {
    try { await session.send({ spec, controlNonce, helperHash }, MAX_LAUNCH_FRAME); }
    catch (error) {
      session.end();
      if (session.protocolFailure || !session.outboundFailure) throw error;
    }
    return await started;
  }
  catch (error) { session.end(); throw error; }
  finally { clearTimeout(timer); }
}

/** Receipt reconciliation is exact and read-only; it never attaches, kills, or repeats a spawn. */
export async function readTerminationReceipt(assetRoot: string, receiptPath: string, spec: SupervisionSpec, process: ProcessReceipt): Promise<TerminationReceipt> {
  const helperHash = pairedHelper(assetRoot).hash;
  const platform = createNativePlatform(assetRoot);
  platform.assertPrivateDirectory(spec.artifactDirectory); platform.assertPrivateFile(receiptPath);
  const receipt = terminationReceipt(parseJson(boundedFile(receiptPath, 65_536), 65_536), spec, process, helperHash);
  for (const artifact of [receipt.stdout, receipt.stderr]) {
    platform.assertPrivateFile(artifact.path);
    let descriptor: number | undefined;
    try {
      const before = lstatSync(artifact.path, { bigint: true });
      if (!before.isFile() || before.isSymbolicLink() || before.size !== BigInt(artifact.bytes)) throw failure('NATIVE_EXECUTION_UNKNOWN');
      descriptor = openSync(artifact.path, 'r');
      const opened = fstatSync(descriptor, { bigint: true });
      if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size) throw failure('NATIVE_EXECUTION_UNKNOWN');
      const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(16_384);
      let bytes = 0;
      while (bytes <= artifact.bytes) {
        const count = readSync(descriptor, buffer, 0, Math.min(buffer.length, artifact.bytes - bytes + 1), null);
        if (!count) break;
        bytes += count; hash.update(buffer.subarray(0, count));
      }
      const after = fstatSync(descriptor, { bigint: true });
      if (bytes !== artifact.bytes || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs || hash.digest('hex') !== artifact.sha256) throw failure('NATIVE_EXECUTION_UNKNOWN');
    } finally { if (descriptor !== undefined) closeSync(descriptor); }
  }
  let accepted = false;
  const { promise: proof, resolve: resolveProof, reject: rejectProof } = Promise.withResolvers<void>();
  void proof.catch(() => undefined);
  const session = new NativeSession(assetRoot, '--receipt-v1', value => {
    if (value.type !== 'reconciled' || !keys(value, ['type', 'terminationReceiptHash']) || value.terminationReceiptHash !== receipt.terminationReceiptHash || accepted) throw failure('NATIVE_EXECUTION_UNKNOWN'); accepted = true; resolveProof();
  }, rejectProof, () => undefined);
  const timer = setTimeout(() => { session.end(); rejectProof(failure('NATIVE_EXECUTION_UNKNOWN')); }, 10_000);
  void session.exited.then(() => { if (!accepted) rejectProof(failure('NATIVE_EXECUTION_UNKNOWN')); });
  try {
    try { await session.send({ spec, process, receiptPath, helperHash }, MAX_LAUNCH_FRAME); }
    catch (error) {
      session.end();
      if (session.protocolFailure || !session.outboundFailure) throw error;
    }
    await proof; session.end(); await session.exited;
    if (session.protocolFailure) throw session.protocolFailure;
    return receipt;
  }
  finally { clearTimeout(timer); session.end(); }
}
