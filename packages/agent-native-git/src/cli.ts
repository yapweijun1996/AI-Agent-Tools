import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import type { Writable } from 'node:stream';
import { AngitError, MAX_JSON_BYTES, IMPLEMENTED_COMMANDS } from './shared.js';
import type { CommandRequest, CoreOptions } from './shared.js';
import { canonical, parseJson, readAsset, readJsonFile, validateSchema } from './json.js';
import { Core } from './core.js';

type Flag = readonly [string, 'string' | 'integer' | 'boolean' | 'file'];
const COMMON: Record<string, Flag> = {
  '--repo': ['repo', 'string'], '--json': ['json', 'boolean'], '--help': ['help', 'boolean'],
  '--request-id': ['requestId', 'string'], '--idempotency-key': ['idempotencyKey', 'string'],
};
const FLAGS: Record<string, Record<string, Flag>> = {
  init: { '--base': ['approvedBase', 'string'], '--policy-file': ['policyFile', 'string'] },
  doctor: { '--deep': ['deep', 'boolean'] },
  status: { '--follow': ['follow', 'boolean'], '--format': ['format', 'string'], '--cursor-file': ['cursor', 'file'], '--limit': ['limit', 'integer'] },
  'task add': { '--file': ['spec', 'file'] },
  'task list': { '--status': ['status', 'string'], '--limit': ['limit', 'integer'], '--after-task-id': ['afterTaskId', 'string'] },
  'task show': { '--history': ['history', 'boolean'], '--cursor-file': ['cursor', 'file'], '--limit': ['limit', 'integer'] },
  'task message': { '--file': ['message', 'file'] },
  'task cancel': { '--reason': ['reason', 'string'], '--wait-ms': ['waitMs', 'integer'] },
  'agent start': { '--task': ['taskId', 'string'], '--profile': ['runtimeProfileId', 'string'], '--retry': ['retry', 'boolean'], '--wait-ms': ['waitMs', 'integer'] },
  'agent stop': { '--reason': ['reason', 'string'], '--wait-ms': ['waitMs', 'integer'] },
  run: { '--parallel': ['parallel', 'integer'], '--auto-integrate': ['autoIntegrate', 'boolean'], '--recover': ['recover', 'boolean'], '--until': ['until', 'string'] },
  'worktree list': { '--include-preserved': ['includePreserved', 'boolean'], '--limit': ['limit', 'integer'] },
  'snapshot list': { '--include-unverified': ['includeUnverified', 'boolean'], '--limit': ['limit', 'integer'], '--after-snapshot-id': ['afterSnapshotId', 'string'] },
};
interface CatalogItem { name: string; slug: string; synopsis: string; capability: string; effects: string; purpose: string }
interface Parsed {
  command: string;
  utility?: 'help' | 'version' | 'capabilities';
  globals: Record<string, unknown>;
  options: Record<string, unknown>;
  files: Record<string, string>;
}
export interface CliOptions {
  /** Internal harness seam; never read from a public option or environment variable. */
  coreOptions?: CoreOptions;
  cwd?: string;
  stdout?: Writable;
  stderr?: Writable;
  interactive?: boolean;
  signal?: AbortSignal;
}
function catalog(): CatalogItem[] {
  const value = parseJson(readAsset('contracts/commands.json'));
  if (value === null || Array.isArray(value) || typeof value !== 'object' || !Array.isArray(value['commands'])) throw new AngitError('ASSET_UNAVAILABLE', 'Command catalog is unavailable.', 6);
  return value['commands'] as unknown as CatalogItem[];
}
function argumentsFor(argv: string[], commands: CatalogItem[]): Parsed {
  if (argv.length > 128 || argv.some((a) => a.length > 4096 || /\u0000/.test(a))) throw new AngitError('INVALID_ARGUMENT', 'Arguments exceed the declared bounds.', 2);
  let index = 0, command = 'help';
  if (argv[0] && !argv[0].startsWith('-')) {
    const first = argv[index++]!;
    command = ['task', 'agent', 'worker', 'worktree', 'integrate', 'snapshot'].includes(first) ? first + ' ' + (argv[index++] ?? '') : first;
    if (!commands.some((c) => c.name === command)) throw new AngitError('UNKNOWN_COMMAND', 'Unknown command. Use --help for the contract catalog.', 2);
    if (!IMPLEMENTED_COMMANDS.some((name) => name === command) && !argv.includes('--help')) throw new AngitError('STAGE_SCOPE_UNAVAILABLE', 'Background workers, integration and restoration are outside Stage 2; no effect was attempted.', 3);
  }
  const globals: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const options: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  const seen: Record<string, true> = Object.create(null) as Record<string, true>;
  const positional: string[] = [];
  let utility: Parsed['utility'] = argv.length === 0 ? 'help' : undefined;
  while (index < argv.length) {
    const arg = argv[index++]!;
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const equal = arg.indexOf('=');
    const key = equal === -1 ? arg : arg.slice(0, equal);
    const inline = equal === -1 ? undefined : arg.slice(equal + 1);
    if (seen[key]) throw new AngitError('DUPLICATE_OPTION', 'Duplicate option is not supported.', 2);
    seen[key] = true;
    if (key === '--version' || key === '--capabilities') {
      if (command !== 'help' || inline !== undefined || utility) throw new AngitError('INVALID_ARGUMENT', 'Utility flags are root-only and mutually exclusive.', 2);
      utility = key === '--version' ? 'version' : 'capabilities'; continue;
    }
    const spec = COMMON[key] ?? FLAGS[command]?.[key];
    if (!spec) throw new AngitError('UNKNOWN_OPTION', 'Unknown option for this command.', 2);
    const [field, kind] = spec;
    const target = Object.hasOwn(COMMON, key) ? globals : options;
    if (kind === 'boolean') {
      if (inline !== undefined) throw new AngitError('INVALID_ARGUMENT', 'Boolean flags do not accept values.', 2);
      target[field] = true;
      if (field === 'help') { if (utility) throw new AngitError('INVALID_ARGUMENT', 'Conflicting utility flags.', 2); utility = 'help'; }
      continue;
    }
    const raw = inline ?? argv[index++];
    if (raw === undefined || raw.startsWith('--')) throw new AngitError('MISSING_OPTION_VALUE', 'An option requires a value.', 2);
    if (kind === 'integer') {
      if (!/^(?:0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new AngitError('INVALID_ARGUMENT', 'An option requires a nonnegative safe integer.', 2);
      target[field] = Number(raw);
    } else if (kind === 'file') files[field] = raw;
    else target[field] = raw;
  }
  if (command === 'task show' || command === 'task cancel') {
    if (positional.length === 1) options['taskId'] = positional[0];
    else if (!utility) throw new AngitError('INVALID_ARGUMENT', 'Exactly one task ID is required.', 2);
  } else if (command === 'agent stop') {
    if (positional.length === 1) options['attemptId'] = positional[0];
    else if (!utility) throw new AngitError('INVALID_ARGUMENT', 'Exactly one attempt ID is required.', 2);
  } else if (positional.length) throw new AngitError('INVALID_ARGUMENT', 'Unexpected positional arguments.', 2);
  if (command === 'help' && !utility) throw new AngitError('INVALID_ARGUMENT', 'Select a command or root utility flag.', 2);
  if (utility && Object.keys(globals).some((key) => !['json', 'help'].includes(key))) throw new AngitError('INVALID_ARGUMENT', 'Help/version/capabilities do not accept execution or repository options.', 2);
  if (utility && (Object.keys(options).length || Object.keys(files).length)) throw new AngitError('INVALID_ARGUMENT', 'Utility flags do not accept command inputs.', 2);
  if (globals['json'] && options['follow']) throw new AngitError('INVALID_ARGUMENT', 'Single JSON results and NDJSON follow are separate modes.', 2);
  if (globals['json'] && options['format'] !== undefined && options['format'] !== 'json') throw new AngitError('INVALID_ARGUMENT', '--json conflicts with a non-JSON format.', 2);
  return { command, utility, globals, options, files };
}
async function write(stream: Writable, text: string, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve, reject) => {
    let returned = false, completed = false, drained = true, settled = false;
    const cleanup = (): void => {
      stream.removeListener('drain', onDrain); signal?.removeEventListener('abort', onAbort);
    };
    const finish = (): void => {
      if (!settled && returned && completed && drained) {
        settled = true; cleanup(); stream.removeListener('error', onError); resolve();
      }
    };
    const onError = (error: Error): void => {
      stream.removeListener('error', onError); cleanup();
      if (!settled) { settled = true; reject(error); }
    };
    const onDrain = (): void => { drained = true; finish(); };
    const onAbort = (): void => {
      if (!settled) {
        settled = true; cleanup();
        // A queued write still owns its error listener until completion/error.
        reject(new DOMException('Output wait interrupted.', 'AbortError'));
      }
    };
    stream.on('error', onError); stream.on('drain', onDrain);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      drained = stream.write(text, (error?: Error | null) => {
        if (error) {
          cleanup();
          if (!settled) { settled = true; reject(error); }
          // Writable emits error after its failed callback; retain onError for that event.
        } else {
          completed = true;
          if (settled) stream.removeListener('error', onError);
          finish();
        }
      });
      returned = true; finish();
      if (signal?.aborted) onAbort();
    } catch (error) {
      stream.removeListener('error', onError); cleanup(); settled = true; reject(error);
    }
  });
}
function errorResult(command: string, requestId: string, began: number, error: unknown): Record<string, unknown> {
  const failure = error instanceof AngitError ? error : new AngitError('INTERNAL_ERROR', 'The operation failed; preserve state and inspect diagnostics.', 6);
  const statuses: Record<number, string> = { 2: 'invalid_input', 3: 'incomplete', 4: 'denied', 5: 'unavailable', 6: 'failed', 7: 'failed' };
  return {
    schemaVersion: 'angit-result/v1', requestId, command, ok: false,
    status: statuses[failure.exitCode] ?? 'failed', data: null, warnings: [],
    error: { code: failure.code, message: failure.message, retryable: failure.retryable, operationId: failure.operationId },
    meta: { durationMs: Math.max(0, Math.ceil(performance.now() - began)), coordinatorEpoch: null, truncated: failure.code === 'OUTPUT_LIMIT' },
  };
}
export async function main(argv: string[], options: CliOptions = {}): Promise<number> {
  const stdout = options.stdout ?? process.stdout, stderr = options.stderr ?? process.stderr;
  const began = performance.now();
  let requestId = 'req_' + randomBytes(16).toString('hex'), command = 'unknown';
  let following = false;
  const controller = new AbortController();
  const outputController = new AbortController();
  let emittingForegroundResult = false;
  let outputDeadline: NodeJS.Timeout | undefined;
  const stop = (): void => { controller.abort(); if (emittingForegroundResult) outputController.abort(); };
  let interrupted = 0;
  const onInt = (): void => { interrupted = 130; stop(); };
  const onTerm = (): void => { interrupted = 143; stop(); };
  let outputFailed = false;
  const streamFailed = (): void => { outputFailed = true; controller.abort(); };
  let diagnosticFailed = false;
  const diagnosticStreamFailed = (): void => { diagnosticFailed = true; };
  stdout.on('error', streamFailed); stderr.on('error', diagnosticStreamFailed);
  try {
    const commands = catalog();
    const parsed = argumentsFor(argv, commands); command = parsed.command;
    following = !parsed.utility && command === 'status' && parsed.options['follow'] === true && parsed.options['format'] === 'ndjson';
    if (typeof parsed.globals['requestId'] === 'string') {
      if (!/^[a-z][a-z0-9_-]{1,63}$/.test(parsed.globals['requestId'])) throw new AngitError('INVALID_INPUT', 'Invalid request identity.', 2);
      requestId = parsed.globals['requestId'];
    }
    const manifest = parseJson(readAsset('package.json')) as { [key: string]: unknown };
    if (parsed.utility) {
      let data: Record<string, unknown>;
      if (parsed.utility === 'version') data = { name: manifest['name'], version: manifest['version'], private: true, stage: 2 };
      else if (parsed.utility === 'capabilities') data = {
        stage: 2, runtime: 'Node 24.21.0, Windows x64', commandCount: commands.length,
        commands: commands.map((item) => ({ name: item.name, available: IMPLEMENTED_COMMANDS.some((n) => n === item.name), capability: item.capability, effects: item.effects })),
        limits: { jsonBytes: MAX_JSON_BYTES, eventBytes: 65_536, depth: 32 },
        exclusions: ['provider compatibility certification', 'background host', 'integration', 'snapshot restoration', 'strong sandbox'],
      };
      else data = {
        stage: 2, command: command === 'help' ? null : command,
        usage: command === 'help' ? commands.map((item) => item.synopsis) : commands.filter((item) => item.name === command).map((item) => item.synopsis),
        availability: command === 'help' ? 'Metadata and controlled foreground execution; remaining leaves are planned.' : IMPLEMENTED_COMMANDS.some((n) => n === command) ? 'Implemented local command' : 'Outside Stage 2; no execution path',
      };
      if (parsed.globals['json']) {
        const result = { schemaVersion: 'angit-result/v1', requestId, command: parsed.utility, ok: true, status: 'completed', data, warnings: [], error: null,
          meta: { durationMs: Math.ceil(performance.now() - began), coordinatorEpoch: null, truncated: false } };
        validateSchema('result.schema.json', result); await write(stdout, JSON.stringify(result) + '\n');
      } else if (parsed.utility === 'version') await write(stdout, String(manifest['version']) + '\n');
      else await write(stdout, JSON.stringify(data, null, 2) + '\n');
      return 0;
    }
    if (process.version !== 'v24.21.0' || process.platform !== 'win32' || process.arch !== 'x64') throw new AngitError('UNSUPPORTED_RUNTIME', 'Execution requires the exercised Windows x64 Node 24.21.0 runtime.', 3);
    const cwd = options.cwd ?? process.cwd();
    const repoPath = resolve(cwd, typeof parsed.globals['repo'] === 'string' ? parsed.globals['repo'] : '.');
    for (const [field, file] of Object.entries(parsed.files)) parsed.options[field] = readJsonFile(resolve(cwd, file), field === 'cursor' ? 4096 : MAX_JSON_BYTES).value;
    if (command === 'init') {
      parsed.options['repoPath'] = repoPath;
      if (typeof parsed.options['policyFile'] === 'string') parsed.options['policyFile'] = resolve(cwd, parsed.options['policyFile']);
    }
    if (command === 'status' && parsed.globals['json']) parsed.options['format'] = 'json';
    const mutating = commands.find((c) => c.name === command)?.effects !== 'read';
    let idempotencyKey = parsed.globals['idempotencyKey'];
    let generated = false;
    if (mutating && idempotencyKey === undefined) {
      const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
      if (!interactive) throw new AngitError('IDEMPOTENCY_KEY_REQUIRED', 'Automation must supply --idempotency-key for mutations.', 2);
      idempotencyKey = 'key_' + randomBytes(16).toString('hex'); generated = true;
    }
    const core = new Core(options.coreOptions);
    const request: CommandRequest = {
      schemaVersion: 'angit-request/v1', requestId, command, options: parsed.options,
      ...(idempotencyKey !== undefined ? { idempotencyKey: String(idempotencyKey) } : {}),
      ...(command !== 'init' ? { projectId: core.resolveProjectId(repoPath) } : {}),
    };
    validateSchema('commands/' + command.replaceAll(' ', '-') + '.schema.json', request);
    if (following || command === 'agent start' || command === 'run') {
      process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
      options.signal?.addEventListener('abort', stop, { once: true });
      if (options.signal?.aborted) controller.abort();
    }
    if (command === 'status' && parsed.options['follow']) {
      await core.follow(request, repoPath, async (event) => {
        validateSchema('event.schema.json', event); const line = canonical(event) + '\n';
        if (Buffer.byteLength(line) > 65_536) throw new AngitError('OUTPUT_LIMIT', 'Event exceeds the declared output limit.', 3);
        if (!controller.signal.aborted) await write(stdout, line, controller.signal);
      }, controller.signal);
      return interrupted;
    }
    const reply = await core.execute(request, repoPath, { signal: controller.signal });
    const data = generated ? { ...reply.data, idempotencyKey } : reply.data;
    const result = { schemaVersion: 'angit-result/v1', requestId, command, ok: true, status: 'completed', data,
      warnings: reply.warnings ?? [], error: null,
      meta: { durationMs: Math.ceil(performance.now() - began), coordinatorEpoch: reply.coordinatorEpoch, truncated: false } };
    validateSchema('result.schema.json', result);
    const json = Boolean(parsed.globals['json']) || parsed.options['format'] === 'json';
    const serialized = JSON.stringify(result, null, json ? undefined : 2) + '\n';
    if (Buffer.byteLength(serialized) > (reply.maxJsonBytes ?? MAX_JSON_BYTES)) throw new AngitError('OUTPUT_LIMIT', 'Result exceeds its output budget; no clipped result is returned.', 3);
    emittingForegroundResult = command === 'agent start' || command === 'run';
    // Already-interrupted execution gets a bounded best-effort receipt; another interruption releases backpressure.
    if (emittingForegroundResult && controller.signal.aborted) outputDeadline = setTimeout(() => outputController.abort(), 1000);
    await write(stdout, serialized, emittingForegroundResult ? outputController.signal : undefined);
    return interrupted || 0;
  } catch (error) {
    if (following && controller.signal.aborted && !outputFailed) return interrupted;
    if (emittingForegroundResult && outputController.signal.aborted && !outputFailed) return interrupted;
    const failure = outputFailed || stdout.errored ? new AngitError('OUTPUT_STREAM_FAILED', 'Consumer output failed; any admitted mutation retains its durable receipt.', 6) : error;
    const result = errorResult(command, requestId, began, failure);
    const diagnostic = following || outputFailed || stdout.errored;
    try { if (!diagnostic || !diagnosticFailed) await write(diagnostic ? stderr : stdout, JSON.stringify(result) + '\n'); } catch { /* Broken consumer: no complete result can be emitted. */ }
    return failure instanceof AngitError ? failure.exitCode : 6;
  } finally {
    clearTimeout(outputDeadline);
    process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
    stdout.removeListener('error', streamFailed); stderr.removeListener('error', diagnosticStreamFailed); options.signal?.removeEventListener('abort', stop);
  }
}
