#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const action = process.argv[2];
const actions = ['bootstrap', 'test:hub', 'test', 'build', 'typecheck', 'lint', 'pack'];
if (!actions.includes(action)) { console.error(`Usage: node scripts/monorepo.mjs ${actions.join('|')}`); process.exit(2); }
const cache = join(root, '.cache');
mkdirSync(join(cache, 'tmp'), { recursive: true });
mkdirSync(join(cache, 'npm'), { recursive: true });
const env = { ...process.env, TMPDIR: realpathSync(join(cache, 'tmp')), TMP: realpathSync(join(cache, 'tmp')), TEMP: realpathSync(join(cache, 'tmp')), npm_config_cache: join(cache, 'npm'), FORCE_COLOR: '0', NODE_TEST_REPORTER: 'tap' };
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const results = [];
function run(name, cwd, command, args) {
  console.log(`\n[${action}] ${name}`);
  const useNpmCli = command === npm && existsSync(npmCli);
  const result = spawnSync(useNpmCli ? process.execPath : command, useNpmCli ? [npmCli, ...args] : args, { cwd, env, stdio: 'inherit' });
  results.push({ package: name, action, status: result.status === 0 ? 'passed' : 'failed', exitCode: result.status, error: result.error?.message });
}
if (action === 'test' || action === 'test:hub') {
  const files = readdirSync(join(root, 'tests')).filter(name => name.endsWith('.test.js')).sort().map(name => join('tests', name));
  run('ai-agent-tools', root, process.execPath, ['--test', ...files]);
  run('hub-python-tests', root, process.platform === 'win32' ? 'python' : 'python3', ['-m', 'unittest', 'tests.test_validate_hub', 'tests.test_verify_migration']);
  run('hub-validator', root, process.platform === 'win32' ? 'python' : 'python3', ['scripts/validate_hub.py']);
  run('source-coverage', root, process.platform === 'win32' ? 'python' : 'python3', ['scripts/verify_migration.py']);
}
for (const folder of action === 'test:hub' ? [] : readdirSync(join(root, 'packages')).sort()) {
  const cwd = join(root, 'packages', folder);
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  if (action === 'bootstrap') run(manifest.name, cwd, npm, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  else if (action === 'pack') { run(manifest.name, cwd, npm, ['pack', '--dry-run', '--ignore-scripts', '--json']); if (['environment-doctor','contract-check','release-guard','runtime-trace','patch-guard','rules-resolve','context-pack'].includes(folder)) run(manifest.name + '-packed-consumer', cwd, npm, ['run','smoke:pack']); }
  else if (manifest.scripts?.[action]) run(manifest.name, cwd, npm, ['run', action]);
  else results.push({ package: manifest.name, action, status: 'not-applicable', reason: `No ${action} script in source package` });
}
writeFileSync(join(cache, `${action}-results.json`), JSON.stringify({ node: process.version, results }, null, 2) + '\n');
console.log('\n' + results.map(r => `${r.package}: ${r.status}`).join('\n'));
process.exit(results.some(r => r.status === 'failed') ? 1 : 0);
