import { ROOT, runNode } from './tooling.mjs';
import { spawnSync } from 'node:child_process';

runNode(['scripts/build.mjs']);
runNode(['scripts/build.mjs', '--typecheck']);
const contracts = spawnSync('python', ['scripts/validate-contracts.py'], { cwd: ROOT, shell: false, stdio: 'inherit', timeout: 180000 });
if (contracts.error || contracts.status !== 0) throw contracts.error || new Error('Offline contract validation failed.');
runNode(['scripts/test.mjs'], { timeout: 28980000 });
runNode(['scripts/pack-check.mjs'], { timeout: 1800000 });
