'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { Refusal, refuse, validateRequest } = require('./request.cjs');
const { canonicalRoot, within } = require('./project-io.cjs');
const { inspectProject } = require('./project.cjs');
const limits = require('./limits.cjs');

const tool = { id: 'agent-call-shape', version: 'unpackaged' };
const scope = 'Direct identifier calls bound to one named function in one explicit TypeScript project; written argument field presence only.';
const help = 'Usage: node cli.cjs inspect --root DIR --project FILE --declaration PATH:LINE:COLUMN --argument N --field KEY [--json]\n' +
  'Set CALL_SHAPE_TYPESCRIPT to the absolute path of a trusted external typescript@5.8.2 lib/typescript.js.\n' +
  'Inspection emits JSON. Standalone text modes: --help, --version.\n';
const failures = new Map(Object.entries({
  INTERNAL_ERROR: [1, 'Tool or trusted compiler unavailable, or unexpected inspection failure.'],
  INPUT_IO: [1, 'A required input could not be read.'],
  INVALID_INPUT: [2, 'Invalid invocation, project configuration, or declaration selector.'],
  UNSUPPORTED_SCOPE: [3, 'The requested scope or compiler version is not supported.'],
  AMBIGUOUS_TARGET: [3, 'The selected name has multiple declarations.'],
  RESOLUTION_INCOMPLETE: [3, 'Required project inputs or call bindings could not be resolved.'],
  INPUT_CHANGED: [3, 'A project input changed during inspection.'],
  RESOURCE_LIMIT: [3, 'Inspection exceeded a declared resource limit.'],
  UNSAFE_PATH: [4, 'A path violates the inspection boundary.'],
}));

function parse(args) {
  if (args[0] !== 'inspect') refuse('INVALID_INPUT');
  const values = new Map();
  for (let i = 1; i < args.length; i++) {
    const key = args[i];
    if (values.has(key)) refuse('INVALID_INPUT');
    if (key === '--json') { values.set(key, true); continue; }
    if (!['--root', '--project', '--declaration', '--argument', '--field'].includes(key)) refuse('INVALID_INPUT');
    const value = args[++i];
    if (!value || value.startsWith('--')) refuse('INVALID_INPUT');
    values.set(key, value);
  }
  const loc = /^(.+):([0-9]+):([0-9]+)$/.exec(values.get('--declaration') ?? '');
  if (!loc || !/^[0-9]+$/.test(values.get('--argument') ?? '')) refuse('INVALID_INPUT');
  const request = { root: values.get('--root'), project: values.get('--project'), field: values.get('--field'),
    argument: Number(values.get('--argument')), declaration: { path: loc[1], line: Number(loc[2]), column: Number(loc[3]) } };
  validateRequest(request);
  return request;
}

function compiler(root) {
  // Never resolve a package name via cwd, NODE_PATH or project metadata.
  const input = process.env.CALL_SHAPE_TYPESCRIPT;
  if (!input || !path.isAbsolute(input) || /^[/\\]{2}/.test(input) ||
      (process.platform === 'win32' && !/^[a-z]:[/\\]/i.test(input))) refuse('INTERNAL_ERROR');
  if (within(root, input)) refuse('UNSAFE_PATH');
  let file;
  try { file = fs.realpathSync.native(input); }
  catch { refuse('INTERNAL_ERROR'); }
  if (within(root, file) || /^[/\\]{2}/.test(file)) refuse('UNSAFE_PATH');
  if (path.basename(file) !== 'typescript.js' || !fs.statSync(file).isFile()) refuse('INTERNAL_ERROR');
  try { return require(file); }
  catch { refuse('INTERNAL_ERROR'); }
}

function render({ data, errorCode }) {
  if (errorCode !== null && !failures.has(errorCode)) errorCode = 'INTERNAL_ERROR';
  const [exitCode, message] = failures.get(errorCode) ?? [0];
  const complete = exitCode === 0;
  const out = { schema_version: '1.0.0', tool, status: complete ? 'ok' : exitCode === 3 ? 'incomplete' : 'error',
    complete, data: complete ? data : null, errors: complete ? [] : [{ code: errorCode, message }], warnings: [],
    meta: { scope, limits } };
  const text = JSON.stringify(out) + '\n';
  if (complete && Buffer.byteLength(text) > limits.max_output_bytes) return render({ data: null, errorCode: 'RESOURCE_LIMIT' });
  return { exitCode, text };
}

function run(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { exitCode: 0, text: help };
  if (argv.length === 1 && argv[0] === '--version') return { exitCode: 0, text: `${tool.id} ${tool.version}\n` };
  try {
    const deadline = performance.now() + limits.max_processing_ms;
    const request = parse(argv);
    request.root = canonicalRoot(request.root);
    const result = render(inspectProject(compiler(request.root), request, deadline));
    if (!result.exitCode && performance.now() >= deadline) refuse('RESOURCE_LIMIT');
    return result;
  } catch (err) {
    return render({ data: null, errorCode: err instanceof Refusal ? err.message : err?.syscall ? 'INPUT_IO' : 'INTERNAL_ERROR' });
  }
}

if (require.main === module) {
  const { exitCode, text } = run(process.argv.slice(2));
  process.exitCode = exitCode;
  process.stdout.write(text);
}
module.exports = { render };
