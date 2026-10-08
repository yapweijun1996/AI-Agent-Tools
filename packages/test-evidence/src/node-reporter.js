import { VERSION, LIMITS } from './result.js';

const countKeys = ['tests', 'suites', 'passed', 'failed', 'skipped', 'todo', 'cancelled'];
const failureTypes = new Set(['callbackAndPromisePresent', 'cancelledByParent', 'testAborted', 'parentAlreadyFinished',
  'subtestsFailed', 'testCodeFailure', 'testTimeoutFailure', 'expectedFailure', 'hookFailed', 'uncaughtException', 'unhandledRejection']);
const ignored = new Set(['test:enqueue', 'test:dequeue', 'test:start', 'test:complete', 'test:plan',
  'test:diagnostic', 'test:stdout', 'test:stderr', 'test:coverage', 'test:log', 'test:interrupted']);

export default async function* reporter(source) {
  let records = 0, bytes = 0, cases = 0, final = false;
  const encode = record => {
    const line = JSON.stringify(record) + '\n'; records++; bytes += Buffer.byteLength(line);
    if (records > LIMITS.max_records - 2 || bytes > LIMITS.max_artifact_bytes - 128) throw new Error('RESOURCE_LIMIT');
    return line;
  };
  yield encode({ type: 'header', schemaVersion: '1.0.0', reporter: { id: 'agent-test-evidence', version: VERSION },
    runtime: { id: 'node', version: process.versions.node } });
  try {
    for await (const event of source) {
      if (!event || typeof event.type !== 'string') throw new Error('UNSUPPORTED_INPUT');
      const data = event.data;
      if (event.type === 'test:summary') {
        if (!data || (data.file !== undefined && typeof data.file !== 'string')) throw new Error('UNSUPPORTED_INPUT');
        if (data.file !== undefined) continue;
        if (final || !data.counts || typeof data.success !== 'boolean' || countKeys.some(k => !Number.isSafeInteger(data.counts[k]) || data.counts[k] < 0)) throw new Error('UNSUPPORTED_INPUT');
        const counts = Object.fromEntries(countKeys.map(k => [k, data.counts[k]]));
        final = true; yield encode({ type: 'summary', success: data.success, counts });
      } else if (event.type === 'test:pass' || event.type === 'test:fail') {
        if (final || !data || !['test', 'suite'].includes(data.details?.type) ||
            (data.skip !== undefined && typeof data.skip !== 'boolean' && typeof data.skip !== 'string') ||
            (data.todo !== undefined && typeof data.todo !== 'boolean' && typeof data.todo !== 'string')) throw new Error('UNSUPPORTED_INPUT');
        if (data.details.type === 'suite') continue;
        if (event.type === 'test:fail' && !failureTypes.has(data.details.error?.failureType)) throw new Error('UNSUPPORTED_INPUT');
        if (++cases > LIMITS.max_cases) throw new Error('RESOURCE_LIMIT');
        const cancelled = ['cancelledByParent', 'testTimeoutFailure', 'testAborted'].includes(data.details.error?.failureType);
        const status = data.skip !== undefined && data.skip !== false ? 'skipped' : data.todo !== undefined && data.todo !== false ? 'todo' :
          cancelled ? 'cancelled' : event.type === 'test:pass' ? 'passed' : 'failed';
        yield encode({ type: 'case', id: `case-${cases}`, status });
      } else if (!ignored.has(event.type)) throw new Error('UNSUPPORTED_INPUT');
    }
    yield encode({ type: 'end' });
  } catch {
    // No raw errors, arbitrary names, stacks or event payloads enter the capture.
    yield '{"type":"unsupported"}\n';
  }
}
