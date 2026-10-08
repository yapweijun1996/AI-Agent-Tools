#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capabilities, summarizeEvidence, verifyEvidence, encodeResult, exitCode } from './index.js';
import { failure, VERSION, LIMITS } from './result.js';
import { InputError, parseJson, readArtifact } from './input.js';
import { decode } from './normalize.js';
import { validateRequest } from './index.js';

const HELP = `agent-test-evidence capabilities [--json]
agent-test-evidence summarize|verify --input FILE.json|--stdin [--root DIR] [--json]
agent-test-evidence --help | --version
Offline analysis only. Paths resolve within root (default cwd). No test execution.
Exit 0 complete analysis (inspect data.verdict), 1 internal/I/O, 2 invalid input,
3 incomplete evidence, 4 unsafe path. Fixed limits; no override switches.
`;
async function stdinBytes() {
  let total = 0; const chunks = [];
  for await (const chunk of process.stdin) {
    total += chunk.length;
    if (total > LIMITS.max_request_bytes) throw new InputError('RESOURCE_LIMIT');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function runCli(args = process.argv.slice(2)) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { console.log(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { console.log(VERSION); return 0; }
  let result;
  try {
    const [operation, ...rest] = args;
    const flags = Object.create(null);
    for (let index = 0; index < rest.length; index++) {
      const flag = rest[index];
      if (!['--json', '--stdin', '--input', '--root'].includes(flag) || Object.hasOwn(flags, flag)) throw new InputError('INVALID_INPUT');
      if (flag === '--json' || flag === '--stdin') flags[flag] = true;
      else {
        if (!rest[index + 1] || rest[index + 1].startsWith('--')) throw new InputError('INVALID_INPUT');
        flags[flag] = rest[++index];
      }
    }
    if (operation === 'capabilities') {
      if (Object.keys(flags).some(k => k !== '--json')) throw new InputError('INVALID_INPUT');
      result = capabilities();
    } else {
      if (!['summarize', 'verify'].includes(operation) || Boolean(flags['--input']) === Boolean(flags['--stdin'])) throw new InputError('INVALID_INPUT');
      const root = flags['--root'] ?? process.cwd();
      const raw = flags['--stdin'] ? await stdinBytes() : readArtifact(root, flags['--input'], ['.json'], LIMITS.max_request_bytes).raw;
      const request = parseJson(decode(raw), LIMITS.max_depth);
      validateRequest(request);
      let total = raw.length;
      const artifacts = request.runs.map(run => {
        const loaded = readArtifact(root, run.artifact.path, ['.json', '.jsonl'], Math.min(LIMITS.max_artifact_bytes, LIMITS.max_total_bytes - total));
        total += loaded.bytes;
        if (total > LIMITS.max_total_bytes) throw new InputError('RESOURCE_LIMIT');
        return { id: run.artifact.id, path: run.artifact.path, bytes: loaded.raw };
      });
      result = (operation === 'verify' ? verifyEvidence : summarizeEvidence)({ request, artifacts });
    }
  } catch (error) { result = failure(error instanceof InputError ? error.code : 'INTERNAL_ERROR'); }
  const encoded = encodeResult(result), emitted = JSON.parse(encoded);
  console.log(args.includes('--json') ? encoded : emitted.status === 'ok' ? `ok: ${emitted.data.verdict ?? 'capabilities'}` : `${emitted.status}: ${emitted.errors[0].code}`);
  return exitCode(emitted);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await runCli();
