// Common measurement producer: explicit execution, artifacts and declarations, no verdict.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const settings = JSON.parse(fs.readFileSync('.study/settings.json', 'utf8'));
const baseline = JSON.parse(fs.readFileSync('.study/baseline.json', 'utf8'));
const output = '.study/output';
fs.mkdirSync(output, { recursive: true });
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function snapshot() {
  const files = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (directory === '.' && ['node_modules', '.study'].includes(entry.name)) continue;
      const filename = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) walk(filename);
      else if (entry.isFile()) files[filename] = fs.readFileSync(filename).toString('base64');
      else throw Error('Nonregular source input');
    }
  }
  walk('.');
  return files;
}
function fingerprint(files) {
  const hash = crypto.createHash('sha256');
  for (const name of Object.keys(files).sort()) {
    hash.update(name); hash.update('\0'); hash.update(Buffer.from(files[name], 'base64')); hash.update('\0');
  }
  return hash.digest('hex');
}
function lines(encoded) {
  if (encoded === undefined) return [];
  const text = Buffer.from(encoded, 'base64').toString('utf8');
  if (text !== '' && !text.endsWith('\n')) throw Error('Source requires a final newline for the registered diff');
  return text === '' ? [] : text.slice(0, -1).split('\n');
}
const before = snapshot();
const sourceHash = fingerprint(before);
const changed = [...new Set([...Object.keys(baseline), ...Object.keys(before)])].sort().filter(name => baseline[name] !== before[name]);
let diff = '';
for (const name of changed) {
  const oldLines = lines(baseline[name]), newLines = lines(before[name]);
  diff += `diff --git a/${name} b/${name}\n`;
  if (!(name in baseline)) diff += 'new file mode 100644\n';
  if (!(name in before)) diff += 'deleted file mode 100644\n';
  diff += `--- ${name in baseline ? 'a/' + name : '/dev/null'}\n+++ ${name in before ? 'b/' + name : '/dev/null'}\n`;
  diff += `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@\n`;
  diff += oldLines.map(line => '-' + line + '\n').join('') + newLines.map(line => '+' + line + '\n').join('');
}
fs.writeFileSync(`${output}/change.diff`, diff);
const tests = fs.readdirSync('test').filter(name => name.endsWith('.test.js')).sort().map(name => 'test/' + name);
// No Node test-worker IPC or captured child pipes: retain the existing sandbox.
const argv = ['--test', '--test-isolation=none', '--test-reporter=' + pathToFileURL(settings.reporter).href, ...tests];
const stdout = fs.openSync(`${output}/native.jsonl`, 'w');
const stderr = fs.openSync(`${output}/native.stderr`, 'w');
let processResult;
try {
  processResult = spawnSync(process.execPath, argv, { cwd: root, timeout: 60000, stdio: ['ignore', stdout, stderr] });
} finally {
  fs.closeSync(stdout); fs.closeSync(stderr);
}
const capture = fs.readFileSync(`${output}/native.jsonl`);
const summary = capture.toString('utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).find(record => record.type === 'summary');
const source = { commit: settings.commit, dirty: true, worktreeSha256: sourceHash };
const environment = { os: process.platform === 'win32' ? 'windows' : 'linux', runtime: 'node', version: process.versions.node };
const request = { schemaVersion: '1.0.0', expectedSource: source,
  requiredChecks: [{ id: 'native', environment }],
  runs: [{ id: 'native-run', checkId: 'native', source, environment,
    producer: { id: 'agent-test-evidence', version: settings.reporterVersion },
    exitCode: processResult.status, signal: processResult.signal, completed: !processResult.error,
    artifact: { id: 'native-capture', path: '.study/output/native.jsonl', format: 'node-jsonl' } }],
};
fs.writeFileSync(`${output}/request.json`, JSON.stringify(request, null, 2) + '\n');
const receipt = { sourceHash, sourceStable: sourceHash === fingerprint(snapshot()), changedPaths: changed, tests,
  argv: [process.execPath, ...argv], exitCode: processResult.status, signal: processResult.signal,
  completed: !processResult.error, errorCode: processResult.error?.code || null,
  summary: summary || null, captureSha256: sha(capture), diffSha256: sha(diff) };
fs.writeFileSync(`${output}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
process.exitCode = processResult.status === 0 && receipt.sourceStable ? 0 : 1;
