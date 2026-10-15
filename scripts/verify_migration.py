"""Verify imported coverage and explicit source updates without rewriting history."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys


def verify_native_import(root):
    """Keep the independent import record separate from the historical snapshot."""
    package = root / 'packages/agent-native-git'
    record = root / 'docs/migration/AGENT_NATIVE_GIT_IMPORT.json'
    if not package.exists() and not record.exists():
        return 0, 0
    if not record.is_file():
        raise ValueError('Agent Native Git import record is required')
    data = json.loads(record.read_text(encoding='utf-8'))
    if (not isinstance(data, dict) or data.get('schema_version') != '1.0.0'
            or not isinstance(data.get('source_commit'), str)
            or not re.fullmatch(r'[0-9a-f]{40}', data['source_commit'])
            or not isinstance(data.get('files'), list) or not data['files']):
        raise ValueError('Invalid Agent Native Git import record')
    expected = set()
    updates = 0
    for item in data['files']:
        if not isinstance(item, dict) or set(item) != {
                'source', 'destination', 'imported_sha256', 'current_sha256', 'reason'}:
            raise ValueError('Invalid Agent Native Git import file fields')
        source = item['source']
        if (not isinstance(source, str) or not source
                or '\\' in source or ':' in source
                or any(part in {'', '.', '..'} for part in source.split('/'))):
            raise ValueError('Unsafe Agent Native Git import source')
        destination = 'packages/agent-native-git/' + source
        if item['destination'] != destination or source in expected:
            raise ValueError('Unknown or duplicate Agent Native Git destination')
        for field in ['imported_sha256', 'current_sha256']:
            if not isinstance(item[field], str) or not re.fullmatch(r'[0-9a-f]{64}', item[field]):
                raise ValueError('Invalid Agent Native Git import digest: ' + destination)
        changed = item['imported_sha256'] != item['current_sha256']
        if ((changed and (not isinstance(item['reason'], str) or not item['reason'].strip()))
                or (not changed and item['reason'] is not None)):
            raise ValueError('Agent Native Git import disposition mismatch: ' + destination)
        path = package / source
        if (path.is_symlink() or not path.is_file()
                or hashlib.sha256(path.read_bytes()).hexdigest() != item['current_sha256']):
            raise ValueError('Agent Native Git migration coverage mismatch: ' + destination)
        expected.add(source)
        updates += int(changed)
    actual = set()
    generated = {'node_modules', 'dist', '.cache', 'build', '__pycache__', 'temp'}
    for directory, folders, filenames in os.walk(package, followlinks=False):
        relative = Path(directory).relative_to(package)
        folders[:] = [name for name in folders if name not in generated
                      and not (relative == Path('tests') and name == '.native')]
        for name in folders + filenames:
            path = Path(directory) / name
            if path.is_symlink():
                raise ValueError('Unsupported symlink in Agent Native Git import: ' + str(path))
        for name in filenames:
            if (name.endswith(('.pyc', '.pyo', '.pyd', '.sqlite', '.sqlite-wal',
                               '.sqlite-shm', '.tgz', '.tsbuildinfo'))
                    or name.startswith('npm-debug.log')):
                continue
            actual.add((relative / name).as_posix())
    if actual != expected:
        raise ValueError('Agent Native Git import inventory mismatch; unrecorded files: '
                         + ', '.join(sorted(actual - expected)) + '; missing files: '
                         + ', '.join(sorted(expected - actual)))
    return len(expected), updates


def verify_imports(root):
    manifest = json.loads((root / 'docs/migration/SOURCE_MANIFEST.json').read_text())
    baselines = {}
    for tool in manifest:
        for item in tool['files']:
            if item['destination'] is None:
                continue
            destination = item['destination']
            if destination in baselines:
                raise ValueError('Duplicate imported destination: ' + destination)
            baselines[destination] = item['imported_sha256']
    expected = dict(baselines)
    updates_path = root / 'docs/migration/SOURCE_UPDATES.json'
    updates = []
    if updates_path.exists():
        data = json.loads(updates_path.read_text())
        if (not isinstance(data, dict) or set(data) != {'schema_version', 'updates'}
                or data['schema_version'] != '1.0.0' or not isinstance(data['updates'], list)):
            raise ValueError('Invalid source update manifest')
        updates = data['updates']
    seen = set()
    for update in updates:
        if (not isinstance(update, dict) or set(update) != {
                'destination', 'imported_sha256', 'current_sha256', 'reason'}):
            raise ValueError('Invalid source update fields')
        destination = update['destination']
        if (not isinstance(destination, str) or destination not in baselines
                or destination in seen):
            raise ValueError('Unknown or duplicate source update destination')
        if update['imported_sha256'] != baselines[destination]:
            raise ValueError('Source update baseline mismatch: ' + destination)
        digest = update['current_sha256']
        if not isinstance(digest, str) or not re.fullmatch(r'[0-9a-f]{64}', digest):
            raise ValueError('Invalid current source digest: ' + destination)
        if not isinstance(update['reason'], str) or not update['reason'].strip():
            raise ValueError('Source update needs a reason: ' + destination)
        seen.add(destination)
        expected[destination] = digest
    failures = []
    for destination, digest in expected.items():
        path = root / destination
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            failures.append(destination)
    if failures:
        raise ValueError('Migration coverage mismatch: ' + ', '.join(failures))
    native_count, native_updates = verify_native_import(root)
    return (len(baselines) + native_count, len(manifest) + int(native_count > 0),
            len(updates) + native_updates)


def main():
    try:
        count, repositories, updates = verify_imports(Path(__file__).resolve().parent.parent)
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(f'Migration coverage: {count} imported files across {repositories} source '
          f'repositories verified; {updates} explicit source updates')
    return 0


if __name__ == '__main__':
    sys.exit(main())
