import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'verify_migration', Path(__file__).resolve().parents[1] / 'scripts/verify_migration.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class VerifyMigrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / 'docs/migration').mkdir(parents=True)
        self.file = self.root / 'packages/tool/source.js'
        self.file.parent.mkdir(parents=True)
        self.file.write_text('original source')
        self.baseline = hashlib.sha256(self.file.read_bytes()).hexdigest()
        self.destination = 'packages/tool/source.js'
        self.save('SOURCE_MANIFEST.json', [{'files': [{
            'destination': self.destination, 'imported_sha256': self.baseline}]}])

    def save(self, name, data):
        (self.root / 'docs/migration' / name).write_text(json.dumps(data))

    def update(self):
        self.file.write_text('authorized source fix')
        return {'destination': self.destination, 'imported_sha256': self.baseline,
                'current_sha256': hashlib.sha256(self.file.read_bytes()).hexdigest(),
                'reason': 'Explicit reviewed source fix'}

    def save_updates(self, updates):
        self.save('SOURCE_UPDATES.json', {'schema_version': '1.0.0', 'updates': updates})

    def test_original_baseline_passes_and_unrecorded_changes_fail(self):
        self.assertEqual(module.verify_imports(self.root), (1, 1, 0))
        self.file.write_text('unrecorded change')
        with self.assertRaisesRegex(ValueError, 'coverage mismatch'):
            module.verify_imports(self.root)

    def test_explicit_update_passes_and_later_tampering_fails(self):
        self.save_updates([self.update()])
        self.assertEqual(module.verify_imports(self.root), (1, 1, 1))
        self.file.write_text('later unrecorded change')
        with self.assertRaisesRegex(ValueError, 'coverage mismatch'):
            module.verify_imports(self.root)

    def test_update_cannot_replace_historical_baseline(self):
        update = self.update()
        update['imported_sha256'] = '0' * 64
        self.save_updates([update])
        with self.assertRaisesRegex(ValueError, 'baseline mismatch'):
            module.verify_imports(self.root)

    def test_unknown_duplicate_and_malformed_updates_fail(self):
        update = self.update()
        cases = [[update, update], [{**update, 'destination': '../outside.js'}],
                 [{**update, 'current_sha256': 'not-a-hash'}],
                 [{**update, 'reason': ''}], [{**update, 'unexpected': True}]]
        for updates in cases:
            with self.subTest(updates=updates):
                self.save_updates(updates)
                with self.assertRaises(ValueError):
                    module.verify_imports(self.root)

    def test_unsupported_update_schema_fails(self):
        self.save('SOURCE_UPDATES.json', {'schema_version': '99.0.0', 'updates': []})
        with self.assertRaisesRegex(ValueError, 'Invalid source update manifest'):
            module.verify_imports(self.root)


if __name__ == '__main__':
    unittest.main()
