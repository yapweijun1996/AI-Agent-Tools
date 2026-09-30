"""Verify imported file coverage without relying on deleted source repositories."""
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'docs/migration/SOURCE_MANIFEST.json').read_text())
failures = []
count = 0
for tool in manifest:
    for item in tool['files']:
        if item['destination'] is None:
            continue
        path = root / item['destination']
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['imported_sha256']:
            failures.append(item['destination'])
        count += 1
if failures:
    raise SystemExit('Migration coverage mismatch: ' + ', '.join(failures))
print(f'Migration coverage: {count} imported files across {len(manifest)} source repositories verified')
