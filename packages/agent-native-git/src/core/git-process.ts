import { spawnSync } from 'node:child_process';
import { isMainThread, isMarkedAsUntransferable, parentPort, workerData } from 'node:worker_threads';

export interface GitProcessRequest {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  input: string | undefined;
}
export interface GitProcessResult {
  status: number | null;
  signal: NodeJS.Signals | null;
  errorCode: string | null;
  stdout: Uint8Array;
  stderr: Uint8Array;
}

if (isMainThread || parentPort === null) throw new Error('Approved Git process requires its finite internal worker');
const request = workerData as GitProcessRequest;
const maxOutputBytes = 4_194_304;
// This native uv loop owns the unchanged deadline even while the coordinator is blocked.
// Node 24's synchronous runner counts stdout and stderr against one maxBuffer budget.
const child = spawnSync(request.executable, request.args, {
  cwd: request.cwd, env: request.env, input: request.input,
  shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 15000, maxBuffer: maxOutputBytes,
});
const result: GitProcessResult = {
  status: child.status, signal: child.signal,
  errorCode: child.error ? (child.error as NodeJS.ErrnoException).code ?? 'GIT_EXECUTION_FAILED' : null,
  stdout: child.stdout ?? new Uint8Array(0), stderr: child.stderr ?? new Uint8Array(0),
};
// Native failures expose no raw diagnostics; discard any read-chunk overshoot before transfer.
if (result.stdout.byteLength + result.stderr.byteLength > maxOutputBytes) result.errorCode ??= 'ENOBUFS';
if (result.errorCode !== null) result.stdout = result.stderr = new Uint8Array(0);
const transfers: ArrayBuffer[] = [];
for (const bytes of [result.stdout, result.stderr]) {
  const buffer = bytes.buffer;
  if (buffer instanceof ArrayBuffer && !isMarkedAsUntransferable(buffer) && !transfers.includes(buffer)) transfers.push(buffer);
}
parentPort.postMessage(result, transfers);
parentPort.close();
