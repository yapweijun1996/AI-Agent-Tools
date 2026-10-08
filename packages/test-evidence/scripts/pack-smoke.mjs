import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv from 'ajv/dist/2020.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), 'ait-test-evidence pack # '));
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
  npm_config_cache: join(consumer, 'cache'), npm_config_update_notifier: 'false' };
delete env.NODE_TEST_CONTEXT;
function run(args, cwd = root, expected = 0) {
  const result = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.status, expected, result.stderr + result.stdout);
  return result.stdout;
}
try {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json')));
  // A throwing lifecycle marker proves the pack/install command disables hooks.
  // The real package contains no lifecycle hooks; the marker stays in the consumer.
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, scripts: { preinstall: 'node -e "process.exit(91)"' } }));
  const [packed] = JSON.parse(run([npmCli, 'pack', '--json', '--ignore-scripts', '--pack-destination', consumer]));
  assert.equal(packed.files.some(f => /^test\/|^scripts\/|node_modules|\.jsonl$/.test(f.path) && !f.path.startsWith('examples/')), false);
  run([npmCli, 'install', '--prefix', consumer, join(consumer, packed.filename), '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
  const installed = join(consumer, 'node_modules', manifest.name), cli = join(installed, 'src/cli.js');
  assert.equal(readFileSync(join(installed, 'LICENSE'), 'utf8'), readFileSync(join(root, 'LICENSE'), 'utf8'));
  const ajv = new Ajv({ strict: true, allErrors: true });
  const validate = ajv.compile(JSON.parse(readFileSync(join(installed, 'schema/result.schema.json'))));
  for (const name of ['request', 'unified', 'node-record']) ajv.compile(JSON.parse(readFileSync(join(installed, `schema/${name}.schema.json`))));
  assert.equal(run([cli, '--version']).trim(), manifest.version);
  const caps = JSON.parse(run([cli, 'capabilities', '--json'])); assert.equal(caps.tool.version, manifest.version); assert.equal(validate(caps), true);
  for (const [name, expected, verdict] of [['pass', 0, 'pass'], ['fail', 0, 'fail'], ['skip', 3, undefined], ['not-run', 3, undefined]]) {
    const result = JSON.parse(run([cli, 'verify', '--input', `examples/${name}-request.json`, '--root', installed, '--json'], root, expected));
    assert.equal(validate(result), true, ajv.errorsText(validate.errors)); assert.equal(result.data?.verdict, verdict);
  }
  const imported = JSON.parse(run(['--input-type=module', '--eval', `
    import fs from 'node:fs'; import * as api from ${JSON.stringify(manifest.name)};
    const base=${JSON.stringify(installed)};
    const request=JSON.parse(fs.readFileSync(base+'/examples/pass-request.json'));
    const result=api.verifyEvidence({request,artifacts:[{id:'capture-1',path:'examples/pass.json',bytes:fs.readFileSync(base+'/examples/pass.json')}]});
    console.log(api.encodeResult(result));
  `], consumer));
  assert.equal(imported.data.verdict, 'pass'); assert.equal(validate(imported), true);
  writeFileSync(join(consumer, 'fixture.mjs'), "import test from 'node:test';test('pass',()=>{});test('skip',{skip:true},()=>{});\n");
  const capture = run(['--test', '--test-reporter', pathToFileURL(join(installed, 'src/node-reporter.js')).href, join(consumer, 'fixture.mjs')], consumer);
  const header = JSON.parse(capture.split('\n')[0]); assert.equal(header.reporter.version, manifest.version);
  const result = JSON.parse(run(['--input-type=module', '--eval', `
    import {normalizeNodeCapture} from ${JSON.stringify(manifest.name)};
    import reporter from ${JSON.stringify(manifest.name + '/node-reporter')};
    console.log(JSON.stringify(normalizeNodeCapture(Buffer.from(${JSON.stringify(capture)}))));
  `], consumer));
  assert.equal(result.summary.counts.tests, 2); assert.equal(result.summary.counts.skipped, 1);
  assert.equal(existsSync(join(installed, 'types/node-reporter.d.ts')), true);
  if (process.platform === 'win32') {
    const shim = join(consumer, 'node_modules/.bin/agent-test-evidence.cmd');
    const linked = spawnSync('cmd.exe', ['/d', '/s', '/c', `""${shim}" capabilities --json"`], { cwd: consumer, env, windowsVerbatimArguments: true, encoding: 'utf8', timeout: 10000 });
    assert.equal(linked.status, 0, linked.stderr); assert.equal(JSON.parse(linked.stdout).complete, true);
  }
  if (process.platform !== 'win32') assert.equal(JSON.parse(run([join(consumer, 'node_modules/.bin/agent-test-evidence'), 'capabilities', '--json'])).complete, true);
  console.log('Packed consumer CLI, ESM API, reporter, installed schemas, version, license and disabled lifecycle checks passed');
} finally { rmSync(consumer, { recursive: true, force: true }); }
