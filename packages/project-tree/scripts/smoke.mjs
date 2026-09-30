import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bin = path.join(root, 'bin', 'aptree.js');

const output = execFileSync(process.execPath, [bin, 'context', '--root', root, '--max-files', '80', '--pretty'], {
  encoding: 'utf8'
});

const parsed = JSON.parse(output);
if (!parsed.graph || !parsed.meta) {
  console.error('Smoke check failed: missing graph or meta in aptree output.');
  process.exit(1);
}
