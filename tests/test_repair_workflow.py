"""Offline invariants for the writable repair study; no provider or project execution."""
import json
from pathlib import Path
import runpy
import tempfile
import unittest

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/evaluate-repair-workflow.py'))


class RepairWorkflowTests(unittest.TestCase):
    def test_source_fingerprint_is_order_independent_and_byte_sensitive(self):
        fingerprint = MODULE['fingerprint']
        self.assertEqual(fingerprint({'a': b'a', 'b': b'b'}), fingerprint({'b': b'b', 'a': b'a'}))
        self.assertNotEqual(fingerprint({'a': b'a'}), fingerprint({'a': b'a\n'}))

    def test_extra_files_are_included_and_protected_changes_are_not_hidden(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'src').mkdir(); (root / 'src/a.js').write_bytes(b'original\n')
            (root / '.study').mkdir(); (root / '.study/output.json').write_bytes(b'ignored')
            baseline = MODULE['source_files'](root)
            (root / 'unexpected.txt').write_bytes(b'extra\n')
            submitted = MODULE['source_files'](root)
            self.assertEqual(MODULE['changes'](baseline, submitted), ['unexpected.txt'])
            self.assertNotIn('unexpected.txt', MODULE['ALLOWED'])
            self.assertNotIn('.study/output.json', submitted)

    def capture(self, mutation=None, raw_suffix=b'\n'):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            answer = {'conclusion': 'pass'}
            events = [
                {'type': 'thread.started', 'thread_id': 'offline'}, {'type': 'turn.started'},
                {'type': 'item.started', 'item': {'id': 'cmd', 'type': 'command_execution'}},
                {'type': 'item.completed', 'item': {'id': 'cmd', 'type': 'command_execution', 'command': 'node test', 'exit_code': 0, 'aggregated_output': '中文'}},
                {'type': 'item.completed', 'item': {'id': 'edit', 'type': 'file_change'}},
                {'type': 'item.completed', 'item': {'id': 'answer', 'type': 'agent_message', 'text': json.dumps(answer)}},
                {'type': 'turn.completed', 'usage': {'input_tokens': 3, 'cached_input_tokens': 0, 'output_tokens': 2}},
            ]
            if mutation:
                mutation(events)
            (root / 'events.jsonl').write_bytes('\n'.join(json.dumps(event, ensure_ascii=False) for event in events).encode() + raw_suffix)
            (root / 'prompt.txt').write_bytes(b'prompt\n'); (root / 'stderr.txt').write_bytes(b'')
            (root / 'answer.json').write_text(json.dumps(answer), encoding='utf-8')
            return MODULE['parse_session'](root, 0, 12, ['offline'])

    def test_writable_capture_allows_file_change_and_preserves_utf8(self):
        record, _ = self.capture()
        self.assertTrue(record['available'])
        self.assertEqual(record['fileChangeEvents'], 1)
        self.assertEqual(record['returnedCommandBytes'], len('中文'.encode()))

    def test_unterminated_or_unpaired_capture_is_unavailable(self):
        record, _ = self.capture(raw_suffix=b'')
        self.assertFalse(record['available'])
        record, _ = self.capture(lambda events: events.pop(3))
        self.assertFalse(record['available'])

    def test_policy_denial_and_web_events_are_unavailable(self):
        record, _ = self.capture(lambda events: events[3]['item'].update(aggregated_output='blocked by policy'))
        self.assertTrue(record['executionPolicyRejected']); self.assertFalse(record['available'])
        record, _ = self.capture(lambda events: events.insert(4, {'type': 'item.completed', 'item': {'type': 'web_search'}}))
        self.assertFalse(record['available'])


if __name__ == '__main__':
    unittest.main()
