"""Offline safety and scoring invariants; never invoke the provider."""
from pathlib import Path
import runpy
import unittest

MODULE = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/evaluate-repair-math.py'))


class RepairMathTests(unittest.TestCase):
    def test_interleaving_preserves_three_attempts_per_arm_for_any_seed(self):
        for seed in range(50):
            order = MODULE['interleaved_order'](seed)
            self.assertEqual(len(order), 6)
            self.assertTrue(all(a[0] != b[0] for a, b in zip(order, order[1:])))
            for condition in ['tool', 'conventional']:
                self.assertEqual([r for c, r in order if c == condition], [1, 2, 3])

    def test_skip_incomplete_zero_and_process_failure_cannot_pass(self):
        passing = {'exitCode': 0, 'summary': {'success': True, 'counts': {
            'tests': 3, 'failed': 0, 'skipped': 0, 'todo': 0, 'cancelled': 0}}}
        self.assertTrue(MODULE['strict_pass'](passing))
        for field in ['failed', 'skipped', 'todo', 'cancelled']:
            bad = {'exitCode': 0, 'summary': {'success': True, 'counts': {**passing['summary']['counts'], field: 1}}}
            self.assertFalse(MODULE['strict_pass'](bad))
        for bad in [{'exitCode': 1, 'summary': passing['summary']}, {'exitCode': 0, 'summary': None},
                    {'exitCode': 0, 'summary': {'success': True, 'counts': {**passing['summary']['counts'], 'tests': 0}}}]:
            self.assertFalse(MODULE['strict_pass'](bad))

    def test_profile_keeps_root_temp_network_denied_and_support_readonly(self):
        base = Path('C:/study')
        policy = MODULE['profile'](base / 'runtime/bin/node', base / 'node_modules/@openai/codex/bin/codex.js',
                                  base / 'deps', base / 'tools')
        self.assertEqual(policy['extends'], ':workspace')
        self.assertFalse(policy['network']['enabled'])
        for key in [':root', ':tmpdir', ':slash_tmp']:
            self.assertEqual(policy['filesystem'][key], 'deny')
        scoped = policy['filesystem'][':workspace_roots']
        self.assertEqual(scoped['.study'], 'read')
        self.assertEqual(scoped['.study/output'], 'write')
        self.assertEqual(scoped['package-lock.json'], 'read')

    def test_reporter_url_preserves_hash_and_space_paths(self):
        url = MODULE['reporter_url'](Path('C:/study # trial/reporter.js'))
        self.assertIn('%20%23%20', url)
        self.assertNotIn('#', url)
        self.assertTrue(url.startswith('file:///mnt/c/'))


if __name__ == '__main__':
    unittest.main()
