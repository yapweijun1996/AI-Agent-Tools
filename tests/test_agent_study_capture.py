"""Offline subprocess controls for development-study capture, with no provider."""
import json
from pathlib import Path
import runpy
import sys
import tempfile
import unittest

RUN_SESSION = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/evaluate-agent-study.py'))['run_session']


class StudyCaptureTests(unittest.TestCase):
    def capture(self, mutation):
        with tempfile.TemporaryDirectory(prefix='study-capture # ') as directory:
            root = Path(directory)
            child = root / 'fake_cli.py'
            child.write_text('''import json, sys
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
answer = {"value": "captured"}
Path(sys.argv[sys.argv.index('-o') + 1]).write_text(json.dumps(answer))
events = [
 {"type": "thread.started", "thread_id": "offline-control"},
 {"type": "turn.started"},
 {"type": "item.completed", "item": {"id": "final", "type": "agent_message", "text": json.dumps(answer)}},
 {"type": "turn.completed", "usage": {"input_tokens": 4, "cached_input_tokens": 0, "output_tokens": 2}},
]
''' + mutation + '\nfor event in events: print(json.dumps(event, ensure_ascii=False))\n', encoding='utf-8')
            schema = root / 'schema.json'; schema.write_text('{}')
            prompt = 'Offline control\nSecond line\n'
            record, answer = RUN_SESSION(sys.executable, str(child), root, prompt, root / 'output', schema)
            self.assertTrue((root / 'output/events.jsonl').exists())
            self.assertEqual((root / 'output/prompt.txt').read_bytes(), prompt.encode('utf-8'))
            self.assertEqual(record, json.loads((root / 'output/process.json').read_text()))
            return record, answer

    def test_complete_capture_preserves_actual_usage_and_argv(self):
        record, answer = self.capture('')
        self.assertTrue(record['available'])
        self.assertEqual(answer, {'value': 'captured'})
        self.assertEqual(record['usage']['input_tokens'], 4)
        self.assertIn('--sandbox', record['argv'])
        self.assertIn('read-only', record['argv'])

    def test_zero_exit_policy_rejection_is_unavailable(self):
        record, _ = self.capture('print("blocked by policy", file=sys.stderr)')
        self.assertEqual(record['exitCode'], 0)
        self.assertTrue(record['executionPolicyRejected'])
        self.assertFalse(record['available'])

    def test_utf8_event_and_answer_text_round_trip(self):
        record, answer = self.capture('''answer["value"] = "captured \\u4e2d\\u6587"
Path(sys.argv[sys.argv.index('-o') + 1]).write_text(json.dumps(answer, ensure_ascii=False), encoding='utf-8')
events[2]["item"]["text"] = json.dumps(answer, ensure_ascii=False)''')
        self.assertTrue(record['available'])
        self.assertEqual(answer['value'], 'captured \u4e2d\u6587')

    def test_truncated_jsonl_is_retained_and_unavailable(self):
        record, _ = self.capture('print("{")')
        self.assertFalse(record['available'])
        self.assertIn('invalid_event_capture', record['captureErrors'])

    def test_missing_or_duplicate_turn_is_unavailable(self):
        for mutation in ['events.pop()', 'events.append(events[-1])']:
            with self.subTest(mutation=mutation):
                record, _ = self.capture(mutation)
                self.assertFalse(record['available'])
                self.assertIn('missing_or_ambiguous_turn', record['captureErrors'])

    def test_unfinished_command_and_failed_events_are_unavailable(self):
        for mutation in [
            'events.insert(2, {"type":"item.started","item":{"id":"cmd","type":"command_execution"}})',
            'events.insert(2, {"type":"turn.failed","error":{"message":"offline failure"}})',
        ]:
            with self.subTest(mutation=mutation):
                record, _ = self.capture(mutation)
                self.assertFalse(record['available'])

    def test_final_message_must_match_answer_file(self):
        record, _ = self.capture('events[2]["item"]["text"] = "{}"')
        self.assertFalse(record['available'])
        self.assertIn('final_message_mismatch', record['captureErrors'])


if __name__ == '__main__':
    unittest.main()
