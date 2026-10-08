import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
test('same name', { concurrency: true }, async t => {
  await Promise.all([t.test('same name', () => {}), t.test('same name', () => {})]);
});
describe('suite', () => { it('same name', () => assert.equal(1, 1)); });
