import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ROOT, runNode } from './tooling.mjs';
import { buildNative } from './build-native.mjs';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--typecheck')) throw new Error('Usage: node scripts/build.mjs [--typecheck]');
const checking = args[0] === '--typecheck';
runNode([resolve(ROOT, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json', ...(checking ? ['--noEmit'] : [])]);
if (!checking) {
  buildNative(ROOT);
  const hooks = resolve(ROOT, 'assets/empty-hooks');
  mkdirSync(hooks, { recursive: true });
  writeFileSync(resolve(hooks, 'README.txt'), 'Git hooks are disabled by pointing to this package-owned directory. It contains no hook programs.\n');
}
