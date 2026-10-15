import { ROOT, runNode } from './tooling.mjs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildExecutionFixture } from './build-fixture.mjs';

buildExecutionFixture(ROOT);
const files = readdirSync(resolve(ROOT, 'tests')).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => resolve(ROOT, 'tests', name));
if (files.length === 0) throw new Error('No behavior tests are present.');
// Actual Windows lifecycle verification reached 45 complete cases at its five-hour ceiling.
// Keep whole-suite observation distinct from bounded individual scenarios/native effects.
runNode(['--test', '--test-reporter=tap', '--test-concurrency=1', ...files], { timeout: 28800000 });
