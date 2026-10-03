#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capabilities, encodeResult, exitCode, failure, LIMITS, packContext } from './index.js';

const HELP = `agent-context-pack pack --manifest FILE.json [--root DIR] [--json]
agent-context-pack capabilities [--json]
agent-context-pack --help | --version
Assemble supplied Hub-envelope result artifacts for one task under a UTF-8 byte budget declared in the manifest.
Relevance is caller-declared (mandatory, priority); duplicates are exact only; mandatory items are never clipped.
Manifest and artifacts resolve under --root (default cwd). No stdin, network, or execution of other tools.
Optional lower caps: --max-items, --max-artifact-bytes, --max-total-bytes, --max-budget-bytes, --max-output-bytes.
Exit 0 complete, 1 internal error, 2 invalid input, 3 incomplete, 4 unsafe path.
`;
const FLAGS = Object.freeze({
  '--max-items': 'max_items', '--max-artifact-bytes': 'max_artifact_bytes', '--max-total-bytes': 'max_total_bytes',
  '--max-budget-bytes': 'max_budget_bytes', '--max-output-bytes': 'max_output_bytes',
});

export function runCli(args = process.argv.slice(2)) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { console.log(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { console.log('0.1.0'); return 0; }
  const json = args.includes('--json');
  let result;
  const limits = {};
  try {
    const [operation, ...rest] = args;
    const flags = Object.create(null);
    const supported = ['--json', '--root', '--manifest', ...Object.keys(FLAGS)];
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i];
      if (!supported.includes(flag) || Object.hasOwn(flags, flag)) throw new Error('INVALID_INPUT');
      if (flag === '--json') flags[flag] = true;
      else {
        if (i + 1 >= rest.length || rest[i + 1].startsWith('--')) throw new Error('INVALID_INPUT');
        flags[flag] = rest[++i];
        if (Object.hasOwn(FLAGS, flag)) {
          const key = FLAGS[flag];
          const value = Number(flags[flag]);
          if (!/^[1-9]\d*$/.test(flags[flag]) || !Number.isSafeInteger(value) || value > LIMITS[key] ||
              value < (key === 'max_output_bytes' ? 1024 : key === 'max_budget_bytes' ? 1024 : 1)) throw new Error('INVALID_INPUT');
          limits[key] = value;
        }
      }
    }
    if (operation === 'capabilities') {
      if (Object.keys(flags).some(flag => flag !== '--json')) throw new Error('INVALID_INPUT');
      result = capabilities();
    } else if (operation === 'pack' && flags['--manifest']) {
      result = packContext({ root: flags['--root'] ?? process.cwd(), manifest: flags['--manifest'], limits });
    } else throw new Error('INVALID_INPUT');
  } catch (error) {
    result = failure(error.message === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'INTERNAL_ERROR', { ...LIMITS, ...limits });
  }
  const encoded = encodeResult(result);
  const emitted = JSON.parse(encoded);
  if (json) console.log(encoded);
  else if (emitted.status !== 'ok') console.log(`${emitted.status}: ${emitted.errors[0]?.code}`);
  else if (emitted.data.included) {
    const { budget, counts } = emitted.data;
    console.log(`ok: included ${counts.included} omitted ${counts.omitted} used ${budget.used}/${budget.max} ${budget.unit}`);
  } else console.log('ok: context-pack-v1');
  return exitCode(emitted);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = runCli();
