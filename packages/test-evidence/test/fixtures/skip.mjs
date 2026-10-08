import test from 'node:test';
test('pass', () => {});
test('sanitized secret name', { skip: 'arbitrary private reason' }, () => {});
test('todo', { todo: 'private reason' }, () => {});
console.log('RAW SECRET STDOUT');
console.error('RAW SECRET STDERR');
