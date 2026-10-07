"""Verify imported coverage and explicit source updates without rewriting history."""
import hashlib
import json
from pathlib import Path
import re
import sys


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
    return len(baselines), len(manifest), len(updates)


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
