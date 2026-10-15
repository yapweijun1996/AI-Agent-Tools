import { dirname, delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NODE = process.env.npm_node_execpath || process.execPath;
const npmCandidates = [process.env.npm_execpath, resolve(dirname(NODE), 'node_modules/npm/bin/npm-cli.js')];
for (const path of (process.env.PATH || process.env.Path || '').split(delimiter)) {
  npmCandidates.push(resolve(path, 'npm'), resolve(path, 'node_modules/npm/bin/npm-cli.js'));
}
export const NPM = npmCandidates.find((path) => {
  if (!path || !existsSync(path)) return false;
  return realpathSync(path).endsWith('npm-cli.js');
});
const observed = spawnSync(NODE, ['--version'], { encoding: 'utf8', timeout: 5000, shell: false });
if (observed.status !== 0 || observed.stdout.trim() !== 'v24.21.0') throw new Error('Use Node 24.21.0 explicitly for development verification. No automatic runtime fallback.');

export function runNode(args, { timeout = 180000, capture = false, cwd = ROOT, env = process.env } = {}) {
  const child = spawnSync(NODE, args, { cwd, env, shell: false, windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Command failed with exit ${child.status}: ${capture ? child.stderr : args.join(' ')}`);
  return child;
}
export function npmArgs(args) {
  if (!NPM) throw new Error('The installed npm JavaScript CLI is unavailable.');
  return [realpathSync(NPM), ...args];
}
