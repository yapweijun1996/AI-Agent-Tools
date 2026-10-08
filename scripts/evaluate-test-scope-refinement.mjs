// Opt-in comparison of frozen Test Scope source with the current built source.
// Does not alter the original four-task protocol or accept changed baselines.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestBytes = readFileSync(join(repo, 'docs/evaluation/tasks.json'));
const manifest = JSON.parse(manifestBytes);
const original = JSON.parse(readFileSync(join(repo, 'docs/evaluation/OBSERVATION_2026-10-08.json')));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(manifestBytes), original.manifestSha256);
assert.equal(Number(process.versions.node.split('.')[0]), 24, 'This replay uses Node 24');
const parent = join(repo, '.cache/test-scope-refinement');
mkdirSync(parent, { recursive: true });
const output = mkdtempSync(join(parent, 'run-'));
const work = mkdtempSync(join(parent, 'fixtures # '));
const snapshot = join(work, 'test-evidence');
const baseline = join(work, 'baseline');
const env = { ...process.env, FORCE_COLOR: '0', NODE_DISABLE_COLORS: '1' };
delete env.NO_COLOR;
delete env.NODE_TEST_CONTEXT;
const commands = [];
function run(label, args, cwd = work) {
  const started = performance.now();
  const p = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  const elapsedMs = performance.now() - started;
  assert.equal(p.error, undefined, label); assert.equal(p.signal, null, label); assert.equal(p.status, 0, p.stderr || p.stdout);
  writeFileSync(join(output, label + '.stdout'), p.stdout); writeFileSync(join(output, label + '.stderr'), p.stderr);
  const record = { label, command: [process.execPath, ...args], cwd, exitCode: p.status, elapsedMs,
    stdoutBytes: Buffer.byteLength(p.stdout), stderrBytes: Buffer.byteLength(p.stderr),
    stdoutSha256: hash(p.stdout), stderrSha256: hash(p.stderr) };
  commands.push(record);
  return { record, stdout: p.stdout, stderr: p.stderr };
}
function git(args) {
  const p = spawnSync('git', args, { cwd: repo, env, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(p.error, undefined); assert.equal(p.status, 0, 'Frozen history unavailable'); return p.stdout;
}
function digestDirectory(dir) {
  const h = createHash('sha256');
  function visit(current, prefix = '') {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) visit(join(current, entry.name), path + '/');
      else { assert.ok(entry.isFile()); h.update(path); h.update('\0'); h.update(readFileSync(join(current, entry.name))); h.update('\0'); }
    }
  }
  visit(dir); return h.digest('hex');
}
function write(path, bytes) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); }
const median = samples => [...samples].sort((a, b) => a - b)[1];
try {
  for (const file of manifest.files) {
    const bytes = git(['show', `${manifest.sourceCommit}:${file.path}`]);
    assert.equal(hash(bytes), file.sha256);
    write(join(snapshot, file.path.slice('packages/test-evidence/'.length)), bytes);
  }
  // Rebuild the old source with the same already-installed compiler/types. No
  // dependency install, network, lifecycle hook or arbitrary script is invoked.
  const baseFiles = git(['ls-tree', '-r', '--name-only', manifest.sourceCommit, 'packages/test-scope']).toString('utf8').trim().split('\n')
    .filter(path => path.includes('/src/') || /\/(?:package(?:-lock)?\.json|tsconfig(?:\.cjs)?\.json)$/.test(path));
  for (const path of baseFiles) write(join(baseline, path.slice('packages/test-scope/'.length)), git(['show', `${manifest.sourceCommit}:${path}`]));
  const compiler = join(repo, 'packages/test-scope/node_modules/typescript/bin/tsc');
  const types = join(repo, 'packages/test-scope/node_modules/@types');
  const compilerVersion = JSON.parse(readFileSync(join(repo, 'packages/test-scope/node_modules/typescript/package.json'))).version;
  assert.equal(compilerVersion, '5.9.3');
  for (const config of ['tsconfig.json', 'tsconfig.cjs.json']) run('build-' + config, [compiler, '-p', join(baseline, config), '--typeRoots', types], baseline);
  write(join(baseline, 'dist/cjs/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
  const oldRuntime = digestDirectory(join(baseline, 'dist'));
  assert.equal(oldRuntime, original.tools['test-scope'].runtimeSha256, 'Rebuilt baseline differs from the original measured runtime');
  const current = join(repo, 'packages/test-scope');
  const currentRuntime = digestDirectory(join(current, 'dist'));
  const currentSource = digestDirectory(join(current, 'src'));
  const inputsBefore = digestDirectory(snapshot);
  const require = createRequire(join(repo, 'packages/test-evidence/package.json'));
  const Ajv = require('ajv/dist/2020.js').default;
  const validate = new Ajv({ strict: false }).compile(JSON.parse(readFileSync(join(current, 'schemas/result.schema.json'))));
  const arms = { before: join(baseline, 'dist/cli.js'), after: join(current, 'dist/cli.js'), compact: join(current, 'dist/cli.js') };
  const samples = Object.fromEntries(Object.keys(arms).map(name => [name, []]));
  let full;
  for (let repetition = 0; repetition < 3; repetition++) {
    const names = Object.keys(arms); if (repetition % 2) names.reverse();
    for (const name of names) {
      const p = run(`${name}-${repetition + 1}`, [arms[name], 'plan', '--root', snapshot, '--changed', 'src/index.js', ...(name === 'compact' ? ['--compact'] : [])], snapshot);
      const value = JSON.parse(p.stdout);
      assert.ok(validate(value), JSON.stringify(validate.errors));
      assert.equal(value.status, 'partial'); assert.equal(value.truncation.truncated, false);
      const minimum = value.data.plan.minimum.tests.map(t => t.path).sort();
      const recommended = value.data.plan.recommended.tests.map(t => t.path).sort();
      assert.deepEqual(minimum, manifest.tasks[1].requiredTests);
      if (name === 'before') assert.deepEqual(recommended, original.tasks[1].arms.tool.samples[0].recommendedTests);
      else assert.deepEqual(recommended, manifest.tasks[1].requiredTests);
      assert.ok(value.data.plan.recommended.commands.every(c => c.executed === false));
      if (name === 'after') full = value;
      if (name === 'compact' && full) assert.deepEqual(value, full);
      samples[name].push({ ...p.record, status: value.status, minimum, recommended, diagnostics: value.diagnostics.map(d => d.code), stats: value.stats });
    }
  }
  for (const list of Object.values(samples)) assert.ok(list.every(s => s.stdoutSha256 === list[0].stdoutSha256 && s.stderrSha256 === list[0].stderrSha256));
  assert.equal(digestDirectory(snapshot), inputsBefore, 'Replay changed task inputs');
  assert.equal(digestDirectory(join(current, 'src')), currentSource);
  assert.equal(digestDirectory(join(current, 'dist')), currentRuntime);
  const result = { schemaVersion: '1.0.0', sourceCommit: manifest.sourceCommit, manifestSha256: hash(manifestBytes),
    harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url))), environment: { os: process.platform, node: process.versions.node, compiler: compilerVersion },
    oldRuntimeSha256: oldRuntime, currentRuntimeSha256: currentRuntime, currentSourceSha256: currentSource,
    frozenInputSha256: inputsBefore, commands, arms: Object.fromEntries(Object.entries(samples).map(([name, list]) => [name, {
      stdoutBytes: list[0].stdoutBytes, stderrBytes: list[0].stderrBytes, medianElapsedMs: median(list.map(s => s.elapsedMs)), samples: list,
    }])), limitations: ['One frozen package task; three process samples, no throughput or independent agent outcome claim.',
      'The older built runtime is rebuilt and content-hash matched; compilation cost is separate from plan timing.',
      'Compact removes whitespace only; default output and full parsed evidence are preserved.',
      'Support classification is an explicit naming heuristic; actual test execution is outside this planner.'] };
  write(join(output, 'measurements.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output: relative(repo, output), before: result.arms.before.stdoutBytes, after: result.arms.after.stdoutBytes,
    compact: result.arms.compact.stdoutBytes, recommendedBefore: 13, recommendedAfter: 5 }));
} finally {
  assert.ok(resolve(work).startsWith(resolve(parent) + sep), 'Unsafe cleanup target');
  rmSync(work, { recursive: true, force: true });
}
