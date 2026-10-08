import test from 'node:test';
test('parent', { timeout: 20 }, async t => {
  void t.test('child', () => new Promise(resolve => setTimeout(resolve, 100)));
  await new Promise(resolve => setTimeout(resolve, 50));
});
