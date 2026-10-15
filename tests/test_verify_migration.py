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

    def native_record(self):
        source = 'src/cli.ts'
        path = self.root / 'packages/agent-native-git' / source
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('independent imported native source')
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return {'schema_version': '1.0.0', 'source_commit': 'a' * 40, 'files': [{
            'source': source, 'destination': 'packages/agent-native-git/' + source,
            'imported_sha256': digest, 'current_sha256': digest, 'reason': None}]}

    def test_independent_import_adds_coverage_without_rewriting_history(self):
        record = self.native_record()
        historical = (self.root / 'docs/migration/SOURCE_MANIFEST.json').read_bytes()
        self.save('AGENT_NATIVE_GIT_IMPORT.json', record)
        self.assertEqual(module.verify_imports(self.root), (2, 2, 0))
        self.assertEqual((self.root / 'docs/migration/SOURCE_MANIFEST.json').read_bytes(), historical)
        destination = self.root / record['files'][0]['destination']
        destination.write_text('unrecorded native modification')
        with self.assertRaisesRegex(ValueError, 'coverage mismatch'):
            module.verify_imports(self.root)
        record['files'][0]['current_sha256'] = hashlib.sha256(destination.read_bytes()).hexdigest()
        record['files'][0]['reason'] = 'Reviewed monorepo metadata adaptation'
        self.save('AGENT_NATIVE_GIT_IMPORT.json', record)
        self.assertEqual(module.verify_imports(self.root), (2, 2, 1))

    def test_native_package_requires_import_record_and_all_handwritten_members(self):
        record = self.native_record()
        with self.assertRaisesRegex(ValueError, 'import record is required'):
            module.verify_imports(self.root)
        self.save('AGENT_NATIVE_GIT_IMPORT.json', record)
        package = self.root / 'packages/agent-native-git'
        unrecorded = package / 'new-source.ts'
        unrecorded.write_text('new handwritten implementation')
        with self.assertRaisesRegex(ValueError, 'unrecorded files: new-source.ts'):
            module.verify_imports(self.root)
        unrecorded.unlink()
        for name in ['dist/cli.js', 'node_modules/dependency/index.js', '.cache/results.json',
                     'tests/.native/fixture.exe', 'scripts/__pycache__/validator.pyc',
                     'runtime.sqlite-wal', 'package.tgz', 'tsconfig.tsbuildinfo']:
            generated = package / name
            generated.parent.mkdir(parents=True, exist_ok=True)
            generated.write_text('generated local verification output')
        self.assertEqual(module.verify_imports(self.root), (2, 2, 0))

    def test_native_import_rejects_unsafe_duplicate_and_unexplained_dispositions(self):
        record = self.native_record()
        item = record['files'][0]
        cases = [
            [{**item, 'source': '../outside'}],
            [{**item, 'destination': 'packages/tool/source.js'}],
            [item, item],
            [{**item, 'current_sha256': '0' * 64}],
            [{**item, 'reason': 'must not invent a change'}],
            [{**item, 'imported_sha256': 'not-a-digest'}],
        ]
        for files in cases:
            with self.subTest(files=files):
                self.save('AGENT_NATIVE_GIT_IMPORT.json', {**record, 'files': files})
                with self.assertRaises(ValueError):
                    module.verify_imports(self.root)


if __name__ == '__main__':
    unittest.main()
