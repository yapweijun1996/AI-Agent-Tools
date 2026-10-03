#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capabilities, encodeResult, exitCode, failure, LIMITS, resolveRules } from './index.js';

const HELP = `agent-rules-resolve resolve --root DIR --target PATH --target-kind file|directory --profile agents-chain-v1 [--include-content] [--json]
agent-rules-resolve capabilities [--json]
agent-rules-resolve --help | --version
Discover local instruction files in root-to-target order; no reference following or semantic conflict resolution.
Root resolves from cwd. Target is a root-relative path with / separators. File targets may be absent if their parent exists.
Optional lower caps: --max-depth, --max-files, --max-file-bytes, --max-total-bytes, --max-output-bytes, --max-duration-ms.
Exit 0 complete, 1 internal error, 2 invalid input, 3 incomplete, 4 unsafe path. No stdin or network.
`;
const FLAGS = Object.freeze({
  '--max-depth': 'max_depth', '--max-files': 'max_files',
  '--max-file-bytes': 'max_file_bytes', '--max-total-bytes': 'max_total_bytes',
  '--max-output-bytes': 'max_output_bytes', '--max-duration-ms': 'max_duration_ms',
});

export function runCli(args = process.argv.slice(2)) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { console.log(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { console.log('0.1.0'); return 0; }
  const json = args.includes('--json');
  let result;
  const limits = { ...LIMITS };
  try {
    const [operation, ...rest] = args;
    const flags = Object.create(null);
    const supported = ['--json', '--include-content', '--root', '--target', '--target-kind', '--profile', ...Object.keys(FLAGS)];
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i];
      if (!supported.includes(flag) || Object.hasOwn(flags, flag)) throw new Error('INVALID_INPUT');
      if (flag === '--json' || flag === '--include-content') flags[flag] = true;
      else {
        if (i + 1 >= rest.length || rest[i + 1].startsWith('--')) throw new Error('INVALID_INPUT');
        flags[flag] = rest[++i];
        if (Object.hasOwn(FLAGS, flag)) {
          const key = FLAGS[flag];
          const value = Number(flags[flag]);
          if (!/^[1-9]\d*$/.test(flags[flag]) || !Number.isSafeInteger(value) ||
              value > LIMITS[key] || value < (key === 'max_output_bytes' ? 1024 : 1))
            throw new Error('INVALID_INPUT');
          limits[key] = value;
        }
      }
    }
    if (operation === 'capabilities') {
      if (Object.keys(flags).some(flag => flag !== '--json')) throw new Error('INVALID_INPUT');
      result = capabilities();
    } else if (operation === 'resolve' && flags['--root'] && flags['--target'] && flags['--target-kind'] && flags['--profile']) {
      result = resolveRules({
        root: flags['--root'], target: flags['--target'], targetKind: flags['--target-kind'],
        profile: flags['--profile'], includeContent: flags['--include-content'] ?? false, limits,
      });
    } else throw new Error('INVALID_INPUT');
  } catch (error) {
    result = failure(error.message === 'INVALID_INPUT' ? 'INVALID_INPUT' : 'INTERNAL_ERROR', 'error', limits);
  }
  const encoded = encodeResult(result);
  const emitted = JSON.parse(encoded);
  if (json) console.log(encoded);
  else if (emitted.status !== 'ok') console.log(`${emitted.status}: ${emitted.errors[0]?.code}`);
  else if (emitted.data.sources) {
    console.log(emitted.data.sources.length ? emitted.data.sources.map(source => `${source.order}. ${source.path}`).join('\n') : 'ok: no applicable local instruction files');
  } else console.log('ok: agents-chain-v1');
  return exitCode(emitted);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = runCli();
