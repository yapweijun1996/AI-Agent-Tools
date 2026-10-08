import test from 'node:test';
import assert from 'node:assert/strict';
test('sensitive failure', () => assert.equal('RAW SECRET VALUE', 'expected'));
