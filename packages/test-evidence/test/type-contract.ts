import { capabilities, summarizeEvidence, verifyEvidence, normalizeNodeCapture, encodeResult, exitCode, type Bundle } from '../types/index.js';
import reporter from '../types/node-reporter.js';
const bundle: Bundle = { request: { schemaVersion: '1.0.0', expectedSource: { commit: 'abcdef0', dirty: false }, requiredChecks: [], runs: [] }, artifacts: [] };
const result = verifyEvidence(bundle);
if (result.status === 'ok') { const verdict: 'pass' | 'fail' | 'unknown' = result.data.verdict; void verdict; }
else { const data: null = result.data; void data; }
encodeResult(summarizeEvidence(bundle)); exitCode(capabilities());
normalizeNodeCapture(new Uint8Array());
reporter((async function* () { yield { type: 'test:diagnostic', data: {} }; })());
