#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { capabilities, checkPatch, encodeResult, exitCode, failure, LIMITS } from './index.js';
import { InputError, parsePolicy, readArtifact } from './input.js';

const HELP = `agent-patch-guard check --diff FILE.diff --policy FILE.json [--root DIR] [--origin snapshot|staged|unstaged|untracked] [--json]
agent-patch-guard capabilities [--json]
agent-patch-guard --help | --version
Read-only checks of a supplied Git patch against explicit policy. Relative files resolve under --root (default cwd).
Optional lower caps: --max-input-bytes, --max-files, --max-changed-lines, --max-findings, --max-output-bytes.
Exit 0 completed (inspect data.verdict), 1 internal error, 2 invalid input, 3 incomplete, 4 unsafe path.
`;
const LIMIT_FLAGS = Object.freeze({
  '--max-input-bytes': 'max_input_bytes', '--max-files': 'max_files',
  '--max-changed-lines': 'max_changed_lines', '--max-findings': 'max_findings',
  '--max-output-bytes': 'max_output_bytes',
});

export function runCli(args = process.argv.slice(2)) {
  if (!args.length || (args.length === 1 && args[0] === '--help')) { console.log(HELP); return 0; }
  if (args.length === 1 && args[0] === '--version') { console.log('0.1.0'); return 0; }
  const json = args.includes('--json');
  let result;
  let limits = {};
  try {
    const [operation, ...rest] = args;
    const flags = Object.create(null);
    const supported = ['--json', '--root', '--diff', '--policy', '--origin', ...Object.keys(LIMIT_FLAGS)];
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i];
      if (!supported.includes(flag) || Object.hasOwn(flags, flag)) throw new InputError('INVALID_INPUT');
      if (flag === '--json') flags[flag] = true;
      else {
        if (i + 1 >= rest.length || rest[i + 1].startsWith('--')) throw new InputError('INVALID_INPUT');
        flags[flag] = rest[++i];
        if (Object.hasOwn(LIMIT_FLAGS, flag)) {
          const key = LIMIT_FLAGS[flag];
          if (!/^[1-9]\d*$/.test(flags[flag])) throw new InputError('INVALID_INPUT');
          const value = Number(flags[flag]);
          if (!Number.isSafeInteger(value) || value > LIMITS[key] || value < (key === 'max_output_bytes' ? 1024 : 1))
            throw new InputError('INVALID_INPUT');
          limits[key] = value;
        }
      }
    }
    if (operation === 'capabilities') {
      if (Object.keys(flags).some(flag => flag !== '--json')) throw new InputError('INVALID_INPUT');
      result = capabilities();
    } else if (operation === 'check' && flags['--diff'] && flags['--policy']) {
      const root = flags['--root'] ?? process.cwd();
      const cap = limits.max_input_bytes ?? LIMITS.max_input_bytes;
      const diff = readArtifact(root, flags['--diff'], ['.diff', '.patch'], cap);
      const policy = parsePolicy(readArtifact(root, flags['--policy'], ['.json'], Math.min(cap, 65536)));
      result = checkPatch(diff, policy, { origin: flags['--origin'] ?? 'snapshot', limits });
    } else throw new InputError('INVALID_INPUT');
  } catch (error) {
    result = error instanceof InputError ? failure(error.code, error.status) : failure('INTERNAL_ERROR');
    if (result.meta?.limits) result.meta.limits = { ...LIMITS, ...limits };
  }
  const encoded = encodeResult(result);
  const emitted = JSON.parse(encoded);
  console.log(json ? encoded : emitted.status + ': ' + (emitted.data?.verdict ?? emitted.errors[0]?.code ?? 'capabilities'));
  return exitCode(emitted);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = runCli();
