"""Materialize the proposal's synthetic inputs, not an analyzer or test runner."""

import json
import re
import shutil
import tempfile
from pathlib import Path


HERE = Path(__file__).resolve().parent


def write_json(path, value):
    path.write_bytes((json.dumps(value, indent=2) + '\n').encode('utf-8'))


def prepare(directory):
    manifest = json.loads((HERE / 'cases.json').read_text(encoding='utf-8'))
    for case in manifest['cases']:
        if not re.fullmatch(r'[a-z][a-z0-9-]*', case['id']):
            raise ValueError('Invalid fixture case ID')
        root = directory / case['id'] / 'root'
        root.mkdir(parents=True)
        files = list(case['files'])
        for name in files:
            if not re.fullmatch(r'[a-z]+\.ts', name):
                raise ValueError('Expected a fixture source basename')
            shutil.copyfile(HERE / 'src' / name, root / name)

        setup = case.get('setup')
        if setup == 'oversize-report':
            # One short UTF-16 filename with a large UTF-8 representation.
            name = '\U0001f680' * 48 + '.ts'
            (root / name).write_bytes(b"import { saveOrder } from './orders';\n" + b'saveOrder({});\n' * 4096)
            files.append(name)
        elif setup == 'sibling-declaration':
            shutil.copyfile(HERE / 'src' / 'orders.ts', root.parent / 'outside.ts')
        elif setup is not None:
            raise ValueError('Unknown fixture setup')

        write_json(root / 'tsconfig.json', {
            'compilerOptions': {'strict': True, 'noEmit': True, 'lib': ['es5'], 'types': []},
            'files': files,
        })
        write_json(root.parent / 'argv.json', [*manifest['commonArgs'], '--declaration', case['declaration'],
                                              '--argument', str(case['argument'])])


if __name__ == '__main__':
    staging = Path(tempfile.mkdtemp(prefix='call-shape-fixtures-'))
    try:
        prepare(staging)
    except BaseException:
        shutil.rmtree(staging)
        raise
    print(staging)
