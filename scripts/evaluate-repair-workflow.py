"""Owner-invoked complete repair replay; isolated source writes, no production changes."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import statistics
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Markdown-Editor'
COMMIT = 'f373f6f3bf77c3f1ce5d6ddb11adfa94c1ee4096'
REFERENCE = '29cc3899eb76e348a3ff9d72a9c1fd7f146ab429'
MODEL, EFFORT, SEED = 'gpt-6.1-sol', 'xhigh', 20261010
ALLOWED = {'src/preview/MarkdownPreview.jsx', 'src/preview/mermaidRenderer.js',
           'src/preview/htmlEscape.js', 'test/previewSafety.test.js'}
TOOLS = {'slice': 'packages/code-slice/dist/cli/index.js', 'scope': 'packages/test-scope/dist/cli.js',
         'patch': 'packages/patch-guard/src/cli.js', 'evidence': 'packages/test-evidence/src/cli.js'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def linux(path):
    resolved = Path(path).resolve()
    assert resolved.drive.upper() == 'C:', 'Only the explicit C: workspace is supported'
    return '/mnt/c/' + resolved.as_posix()[3:]


def git(*args):
    return subprocess.check_output(['git', '-C', str(SOURCE), *args])


def source_files(root):
    files = {}
    def walk(directory):
        for filename in sorted(directory.iterdir()):
            if directory == root and filename.name in ('.study', 'node_modules'):
                continue
            if filename.is_symlink() or filename.is_junction():
                raise ValueError('Nonregular source path')
            if filename.is_dir():
                walk(filename)
            elif filename.is_file():
                files[filename.relative_to(root).as_posix()] = filename.read_bytes()
            else:
                raise ValueError('Nonregular source input')
    walk(root)
    return files


def fingerprint(files):
    digest = hashlib.sha256()
    for name in sorted(files):
        digest.update(name.encode()); digest.update(b'\0'); digest.update(files[name]); digest.update(b'\0')
    return digest.hexdigest()


def changes(baseline, submitted):
    return sorted(name for name in set(baseline) | set(submitted) if baseline.get(name) != submitted.get(name))


def parse_session(directory, exit_code, elapsed, argv):
    errors = []
    raw = (directory / 'events.jsonl').read_bytes()
    if raw and not raw.endswith(b'\n'):
        errors.append('unterminated_event_capture')
    try:
        events = [json.loads(line) for line in raw.decode('utf-8').splitlines() if line]
    except (UnicodeError, json.JSONDecodeError):
        events = []; errors.append('invalid_event_capture')
    completed = [event['item'] for event in events if event.get('type') == 'item.completed']
    commands = [item for item in completed if item.get('type') == 'command_execution']
    started = [event['item']['id'] for event in events if event.get('type') == 'item.started'
               and event.get('item', {}).get('type') == 'command_execution']
    ended = [item['id'] for item in commands]
    if sorted(started) != sorted(ended) or len(set(started)) != len(started):
        errors.append('unpaired_command_events')
    threads = [event['thread_id'] for event in events if event.get('type') == 'thread.started']
    usage = [event['usage'] for event in events if event.get('type') == 'turn.completed']
    if len(threads) != 1 or len(usage) != 1 or sum(event.get('type') == 'turn.started' for event in events) != 1:
        errors.append('missing_or_ambiguous_turn')
    if any(event.get('type') in ('error', 'turn.failed') for event in events):
        errors.append('failed_event')
    answer_path = directory / 'answer.json'
    try:
        answer = json.loads(answer_path.read_bytes()) if answer_path.exists() else None
        messages = [item['text'] for item in completed if item.get('type') == 'agent_message']
        if answer is None or not messages or json.loads(messages[-1]) != answer:
            errors.append('final_message_mismatch')
    except (UnicodeError, json.JSONDecodeError):
        answer = None; errors.append('invalid_final_answer')
    stderr = (directory / 'stderr.txt').read_bytes()
    rejected = b'blocked by policy' in stderr or any('blocked by policy' in item.get('aggregated_output', '') for item in commands)
    forbidden = [item.get('type') for item in completed if item.get('type') in ('web_search', 'mcp_tool_call')]
    record = {'available': exit_code == 0 and not errors and not rejected and not forbidden,
              'exitCode': exit_code, 'elapsedMs': elapsed, 'argv': argv, 'captureErrors': errors,
              'executionPolicyRejected': rejected, 'forbiddenEvents': forbidden, 'threadIds': threads,
              'calls': len(commands), 'fileChangeEvents': sum(item.get('type') == 'file_change' for item in completed),
              'failedCommands': sum(item.get('exit_code') != 0 for item in commands),
              'returnedCommandBytes': sum(len(item.get('aggregated_output', '').encode()) for item in commands),
              'usage': usage[0] if len(usage) == 1 else None,
              'eventsSha256': sha(raw), 'stderrSha256': sha(stderr),
              'promptSha256': sha((directory / 'prompt.txt').read_bytes()),
              'answerSha256': sha(answer_path.read_bytes()) if answer is not None else None}
    dump(directory / 'process.json', record)
    dump(directory / 'command-inventory.json', commands)
    return record, answer


def session(node, codex, workspace, prompt, directory, schema):
    directory.mkdir()
    (directory / 'prompt.txt').write_bytes(prompt.encode('utf-8'))
    args = ['wsl.exe', '-d', 'Ubuntu', '--exec', 'timeout', '--kill-after=5', '895s', 'env',
            'PATH=' + linux(Path(node).parent) + ':/usr/local/bin:/usr/bin:/bin', linux(node), linux(codex),
            'exec', '--ignore-user-config', '--ephemeral', '--json', '--sandbox', 'workspace-write',
            '--skip-git-repo-check', '-C', linux(workspace), '-m', MODEL,
            '-c', f'model_reasoning_effort="{EFFORT}"', '-c', 'approval_policy="never"',
            '-c', 'project_doc_max_bytes=0', '--output-schema', linux(schema), '-o', linux(directory / 'answer.json'), '-']
    started = time.perf_counter()
    with (directory / 'events.jsonl').open('wb') as stdout, (directory / 'stderr.txt').open('wb') as stderr:
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr)
        try:
            process.communicate(prompt.encode('utf-8'), timeout=900)
        except subprocess.TimeoutExpired:
            subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, check=False)
            process.wait()
    return parse_session(directory, process.returncode, (time.perf_counter() - started) * 1000, args)


def native(node, codex, cwd, arguments, directory, env=None, sandbox=True):
    directory.mkdir(parents=True, exist_ok=True)
    command = ['wsl.exe', '-d', 'Ubuntu', '--cd', linux(cwd), '--exec', 'timeout', '--kill-after=5', '65s',
               'env', 'PATH=' + linux(Path(node).parent) + ':/usr/local/bin:/usr/bin:/bin']
    if sandbox:
        mode = sandbox if isinstance(sandbox, str) else 'read-only'
        command += [linux(node), linux(codex), 'sandbox', '-c', f'sandbox_mode="{mode}"', '-c', 'approval_policy="never"']
    command += ['env', '-i', 'PATH=' + linux(Path(node).parent) + ':/usr/bin:/bin', 'HOME=' + linux(cwd / '.study/empty-home')]
    command += [f'{name}={value}' for name, value in (env or {}).items()]
    command += [linux(node), *arguments]
    started = time.perf_counter()
    process = subprocess.run(command, capture_output=True, timeout=75)
    (directory / 'stdout').write_bytes(process.stdout); (directory / 'stderr').write_bytes(process.stderr)
    record = {'argv': command, 'exitCode': process.returncode, 'elapsedMs': (time.perf_counter() - started) * 1000,
              'stdoutSha256': sha(process.stdout), 'stderrSha256': sha(process.stderr)}
    dump(directory / 'process.json', record)
    return record


def verify(node, codex, workspace, directory, deps, baseline, support):
    started = time.perf_counter()
    submitted = source_files(workspace)
    changed = changes(baseline, submitted)
    protected = [name for name in changed if name not in ALLOWED]
    support_stable = all((workspace / name).read_bytes() == data for name, data in support.items())
    support_stable = support_stable and all(
        file.relative_to(workspace).as_posix() in support
        for file in (workspace / '.study').rglob('*')
        if file.is_file() and 'output' not in file.relative_to(workspace / '.study').parts)
    result = {'changedPaths': changed, 'protectedChanges': protected, 'supportStable': support_stable,
              'sourceSha256': fingerprint(submitted), 'sourceStable': False,
              'native': None, 'acceptance': None, 'repairCorrect': False}
    if changed and not protected and support_stable:
        tests = sorted('test/' + file.name for file in (workspace / 'test').glob('*.test.js'))
        result['native'] = native(node, codex, workspace, ['--test', '--test-isolation=none', '--test-reporter=' + linux(ROOT / 'packages/test-evidence/src/node-reporter.js'), *tests], directory / 'native')
        result['acceptance'] = native(node, codex, workspace,
            ['--experimental-vm-modules', '--test', '--test-isolation=none', '--test-reporter=' + linux(ROOT / 'packages/test-evidence/src/node-reporter.js'),
             linux(ROOT / 'scripts/repair-workflow-acceptance.mjs')], directory / 'acceptance',
            {'REPAIR_PROJECT': linux(workspace), 'REPAIR_DEPS': linux(deps),
             'REPAIR_TYPESCRIPT': linux(ROOT / 'packages/code-slice/node_modules/typescript/lib/typescript.js')})
        for kind in ['native', 'acceptance']:
            records = [json.loads(line) for line in (directory / kind / 'stdout').read_text(encoding='utf-8').splitlines() if line]
            summaries = [record for record in records if record.get('type') == 'summary']
            result[kind]['summary'] = summaries[0] if len(summaries) == 1 else None
            result[kind]['strictPass'] = (result[kind]['exitCode'] == 0 and len(summaries) == 1 and summaries[0]['success']
                and summaries[0]['counts']['tests'] > 0 and all(summaries[0]['counts'][key] == 0 for key in ['failed', 'skipped', 'todo', 'cancelled']))
        result['sourceStable'] = submitted == source_files(workspace)
        result['repairCorrect'] = (result['sourceStable'] and 'test/previewSafety.test.js' in submitted
                                   and result['native']['strictPass'] and result['acceptance']['strictPass'])
    result['elapsedMs'] = (time.perf_counter() - started) * 1000
    directory.mkdir(parents=True, exist_ok=True); dump(directory / 'result.json', result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--node', required=True)
    parser.add_argument('--codex-js', required=True)
    args = parser.parse_args()
    assert args.run, 'Owner authorization and --run are required for provider-backed execution'
    node, codex = Path(args.node).resolve(), Path(args.codex_js).resolve()
    source_status = git('status', '--porcelain')
    assert not source_status, 'Protect unrelated source repository work'
    source_head = git('rev-parse', 'HEAD').decode().strip()
    assert not git('ls-tree', '-r', '--name-only', COMMIT, '--', 'AGENTS.md').strip()
    parent = ROOT / '.cache/repair-workflow'; parent.mkdir(parents=True, exist_ok=True)
    evidence = Path(tempfile.mkdtemp(prefix='run-', dir=parent))
    work = Path(tempfile.mkdtemp(prefix='repair-workflow # '))
    print('Evidence:', evidence.relative_to(ROOT), flush=True)
    dump(evidence / 'ownership.json', {'temporaryRoot': str(work), 'sourceRepository': str(SOURCE), 'sourceHead': source_head})
    try:
        baseline = {}
        seed = work / 'seed'; seed.mkdir()
        for name in git('ls-tree', '-r', '--name-only', COMMIT, '--', 'src', 'test', 'package.json', 'package-lock.json').decode().splitlines():
            data = git('show', f'{COMMIT}:{name}')
            assert len(data) < 1024 * 1024 and len(baseline) < 256
            baseline[name] = data
            target = seed / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        assert not any(name.endswith('/AGENTS.md') for name in baseline)
        deps = work / 'dependencies'; deps.mkdir()
        for name in ['package.json', 'package-lock.json']:
            (deps / name).write_bytes(baseline[name])
        versions = native(node, codex, work, ['-p', 'JSON.stringify({node:process.versions.node})'], evidence / 'runtime')
        assert versions['exitCode'] == 0
        assert json.loads((evidence / 'runtime/stdout').read_bytes())['node'] == '24.19.0'
        cli_version = subprocess.check_output(['wsl.exe', '-d', 'Ubuntu', '--exec', linux(node), linux(codex), '--version']).decode().strip()
        assert cli_version == 'codex-cli 0.161.0'
        fields = {'conclusion': {'type': 'string', 'enum': ['pass', 'fail', 'unknown']},
                  'changedPaths': {'type': 'array', 'items': {'type': 'string'}},
                  'testsRun': {'type': 'array', 'items': {'type': 'string'}},
                  'reason': {'type': 'string'}, 'limitations': {'type': 'array', 'items': {'type': 'string'}}}
        schema = evidence / 'answer-schema.json'
        dump(schema, {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False})
        preflight = work / 'preflight'; preflight.mkdir()
        (preflight / 'test.test.mjs').write_text("import test from 'node:test'; import assert from 'node:assert/strict'; test('authorized fixture',()=>assert.equal(2+2,4));\n", encoding='utf-8')
        record, answer = session(node, codex, preflight,
            'Authorized write preflight, not a repair participant. Inside this fixture ONLY create marker.txt containing ready and run node --test --test-isolation=none test.test.mjs. '
            'Do not read other files, use Git, network, credentials or change policy. Return conclusion pass only after both succeed, changedPaths ["marker.txt"], testsRun ["node --test --test-isolation=none test.test.mjs"], reason and limitations.',
            evidence / 'preflight', schema)
        assert record['available'] and answer['conclusion'] == 'pass' and (preflight / 'marker.txt').read_text().strip() == 'ready', 'Authorized write/test preflight unavailable; do not bypass controls'
        npm = Path(node).parents[1] / 'lib/node_modules/npm/bin/npm-cli.js'
        started = time.perf_counter()
        install = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--cd', linux(deps), '--exec', 'timeout', '--kill-after=5', '240s',
            'env', 'PATH=' + linux(Path(node).parent) + ':/usr/bin:/bin', linux(node), linux(npm),
            'ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], capture_output=True, timeout=250)
        (evidence / 'dependency.stdout').write_bytes(install.stdout); (evidence / 'dependency.stderr').write_bytes(install.stderr)
        dump(evidence / 'dependency.json', {'exitCode': install.returncode, 'elapsedMs': (time.perf_counter() - started) * 1000,
            'lockSha256': sha(baseline['package-lock.json']), 'ignoreScripts': True,
            'stdoutSha256': sha(install.stdout), 'stderrSha256': sha(install.stderr)})
        assert install.returncode == 0, 'Locked dependency setup failed'
        # A junction is common setup, outside fingerprint/policy scope and never writable by participants.
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(seed / 'node_modules'), str(deps / 'node_modules')], check=True, capture_output=True)
        support = {
            '.study/collect.mjs': (ROOT / 'scripts/repair-workflow-collect.mjs').read_bytes(),
            '.study/baseline.json': (json.dumps({name: base64.b64encode(data).decode() for name, data in baseline.items()}) + '\n').encode(),
            '.study/settings.json': (json.dumps({'commit': COMMIT, 'reporter': linux(ROOT / 'packages/test-evidence/src/node-reporter.js'),
                'reporterVersion': json.loads((ROOT / 'packages/test-evidence/package.json').read_bytes())['version']}) + '\n').encode(),
            '.study/policy.json': (json.dumps({'schema_version': '1.0.0', 'allowed_paths': sorted(ALLOWED),
                                             'protected_paths': ['package.json', 'package-lock.json', '.study/']}) + '\n').encode(),
        }
        for name, data in support.items():
            target = seed / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        # Freeze before baseline/reference controls, not merely before participants.
        order = [(condition, repetition) for condition in ['conventional', 'tool'] for repetition in range(1, 4)]
        random.Random(SEED).shuffle(order)
        watched = {str(ROOT / name): sha((ROOT / name).read_bytes()) for name in TOOLS.values()}
        registration = {'schemaVersion': '1.0.0', 'seed': SEED, 'order': order, 'model': MODEL, 'effort': EFFORT,
            'cli': cli_version, 'runtime': 'Ubuntu WSL Node 24.19.0', 'sourceCommit': COMMIT, 'historicalFix': REFERENCE,
            'sourceHead': source_head, 'baselineSha256': fingerprint(baseline),
            'sourceFiles': [{'path': name, 'bytes': len(data), 'sha256': sha(data)} for name, data in sorted(baseline.items())],
            'protocolSha256': sha((ROOT / 'docs/evaluation/REPAIR_WORKFLOW_PROTOCOL.md').read_bytes()),
            'harnessSha256': sha(Path(__file__).read_bytes()), 'acceptanceSha256': sha((ROOT / 'scripts/repair-workflow-acceptance.mjs').read_bytes()),
            'supportSha256': {name: sha(data) for name, data in support.items()}, 'watched': watched}
        dump(evidence / 'registration.json', registration)
        for name, filename in [('harness-snapshot.py', Path(__file__)), ('protocol-snapshot.md', ROOT / 'docs/evaluation/REPAIR_WORKFLOW_PROTOCOL.md'),
                               ('acceptance-snapshot.mjs', ROOT / 'scripts/repair-workflow-acceptance.mjs'), ('collector-snapshot.mjs', ROOT / 'scripts/repair-workflow-collect.mjs')]:
            shutil.copyfile(filename, evidence / name)
        def clone(name):
            target = work / name
            shutil.copytree(seed, target, ignore=shutil.ignore_patterns('node_modules'))
            subprocess.run(['cmd', '/c', 'mklink', '/J', str(target / 'node_modules'), str(deps / 'node_modules')], check=True, capture_output=True)
            return target
        control = clone('baseline-control')
        tests = sorted('test/' + file.name for file in (control / 'test').glob('*.test.js'))
        baseline_native = native(node, codex, control, ['--test', '--test-isolation=none',
            '--test-reporter=' + linux(ROOT / 'packages/test-evidence/src/node-reporter.js'), *tests], evidence / 'controls/baseline-native')
        assert baseline_native['exitCode'] == 0, 'Existing tests must pass before study'
        native_summary = [json.loads(line) for line in (evidence / 'controls/baseline-native/stdout').read_bytes().splitlines() if line]
        assert [record['counts'] for record in native_summary if record.get('type') == 'summary'] == [
            {'tests': 6, 'suites': 0, 'passed': 6, 'failed': 0, 'skipped': 0, 'todo': 0, 'cancelled': 0}]
        # Baseline accepts no patch: explicitly run the independent fixture to prove its discriminating behavior.
        baseline_acceptance = native(node, codex, control, ['--experimental-vm-modules', '--test', '--test-isolation=none',
            '--test-reporter=' + linux(ROOT / 'packages/test-evidence/src/node-reporter.js'), linux(ROOT / 'scripts/repair-workflow-acceptance.mjs')],
            evidence / 'controls/baseline-acceptance', {'REPAIR_PROJECT': linux(control), 'REPAIR_DEPS': linux(deps),
            'REPAIR_TYPESCRIPT': linux(ROOT / 'packages/code-slice/node_modules/typescript/lib/typescript.js')})
        assert baseline_acceptance['exitCode'] == 1, 'Acceptance must reproduce the real baseline defect'
        failed_summary = [json.loads(line) for line in (evidence / 'controls/baseline-acceptance/stdout').read_bytes().splitlines() if line]
        assert [record['counts'] for record in failed_summary if record.get('type') == 'summary'] == [
            {'tests': 11, 'suites': 0, 'passed': 3, 'failed': 8, 'skipped': 0, 'todo': 0, 'cancelled': 0}], 'Failures must be the registered behavior cases, not a loader failure'
        reference = clone('reference-control')
        for name in ['src/preview/MarkdownPreview.jsx', 'src/preview/mermaidRenderer.js', 'src/preview/htmlEscape.js']:
            (reference / name).write_bytes(git('show', f'{REFERENCE}:{name}'))
        (reference / 'test/previewSafety.test.js').write_bytes(git('show', f'{REFERENCE}:test/htmlEscape.test.js'))
        reference_result = verify(node, codex, reference, evidence / 'controls/reference', deps, baseline, support)
        assert reference_result['repairCorrect'], 'Historical source fix must satisfy frozen acceptance'
        producer_control = native(node, codex, reference, ['.study/collect.mjs'], evidence / 'controls/producer', sandbox='workspace-write')
        assert producer_control['exitCode'] == 0, 'Common producer must execute before participants'
        receipt = json.loads((reference / '.study/output/receipt.json').read_bytes())
        assert receipt['sourceHash'] == reference_result['sourceSha256'] and receipt['sourceStable']
        for name, arguments in [
            ('evidence', ['verify', '--root', '.', '--input', '.study/output/request.json', '--json']),
            ('patch', ['check', '--root', '.', '--diff', '.study/output/change.diff', '--policy', '.study/policy.json', '--origin', 'snapshot', '--json']),
        ]:
            analysis = native(node, codex, reference, [linux(ROOT / TOOLS[name]), *arguments], evidence / f'controls/{name}')
            result = json.loads((evidence / f'controls/{name}/stdout').read_bytes())
            assert analysis['exitCode'] == 0 and result['status'] == 'ok' and result['data']['verdict'] == 'pass', 'Shared artifacts must satisfy tool contracts'
        print('Baseline reproduced; historical source repair passes. Registered six participants.', flush=True)
        records = []
        common = (
            'Repair this isolated historical Markdown-Editor source fixture. No repository history or solution is supplied. '
            'The missing mdimg:// image placeholder must display arbitrary alt text literally, escaping &, <, >, double and single quotes before HTML insertion. '
            'Mermaid error messages must display those same characters literally, including literal entity text, without changing successful SVG. '
            'Preserve ordinary image rendering/object URLs, external link attributes, table/fence rendering, empty-alt fallback and lazy Mermaid loading. '
            'Locate the actual boundaries, make a minimal coherent patch, add meaningful Node regression tests in test/previewSafety.test.js and run ALL native tests with node --test --test-isolation=none test/*.test.js. '
            'Use the explicit no-isolation flag so Node test-worker IPC does not lose individual case events in this sandbox. '
            'Only edit src/preview/MarkdownPreview.jsx, src/preview/mermaidRenderer.js, optional src/preview/htmlEscape.js and new test/previewSafety.test.js. '
            'Protect existing tests, metadata, locks, unrelated files and .study support. Source edits require final newlines. '
            'Use POSIX reads/rg and local edits. Do not use Git, network commands, credentials, installations, delegation or policy changes. '
            'Read dependencies only. Do not inspect .study/baseline.json (the producer owns it), outside source, other trials, evaluator files or historical commits. '
            'After editing/testing run node .study/collect.mjs; it executes all supplied native tests and emits an actual source diff, reporter capture, process receipt and declared source/environment request. '
            'Inspect its outputs under .study/output plus .study/policy.json for the final patch and evidence decision. '
            'Analysis exit zero alone does not mean pass. Only conclude pass for current stable source, complete zero-exit successful nonzero tests without fail/skip/todo/cancelled and a permitted patch. '
            'This is module-level evidence, not complete application/browser/business/security acceptance. Source/environment declarations are not authenticated facts. '
            'Return exactly the schema fields: conclusion pass/fail/unknown, actual changedPaths (project-relative), testsRun, reason and limitations. '
            'Deadline 900 seconds; finish even when evidence is unavailable, retaining unknown rather than inventing success.\n')
        for index, (condition, repetition) in enumerate(order, 1):
            workspace = clone(f'trial-{index:02d}')
            prompt = common
            if condition == 'conventional':
                prompt += 'Condition: ordinary workflow only. Do not invoke AI-Agent-Tools analyzers. Read/search source, author tests, run native tests and inspect the producer diff/receipt/request to reason about acceptance.\n'
            else:
                command = {name: 'node ' + json.dumps(linux(ROOT / filename)) for name, filename in TOOLS.items()}
                prompt += ('Condition: four-tool workflow. Attempt each analyzer at least once at its relevant stage; parse statuses, never equate static scope with test execution. '
                    f'Code Slice: {command["slice"]} outline src/preview/MarkdownPreview.jsx --root . --compact --json (symbol/range also available). '
                    f'Test Scope after authoring tests: {command["scope"]} plan --root . --changed src/preview/MarkdownPreview.jsx --changed src/preview/mermaidRenderer.js --compact; execute full native tests even if selection is incomplete. '
                    f'After producer collection, Patch Guard: {command["patch"]} check --root . --diff .study/output/change.diff --policy .study/policy.json --origin snapshot --json. '
                    f'Test Evidence: {command["evidence"]} verify --root . --input .study/output/request.json --json. '
                    'These explicit analyzer entry points are the only authorized outside-workspace tool reads/execution. Inspect tool verdicts and binding limitations.\n')
            trial = evidence / f'trial-{index:02d}'
            record, answer = session(node, codex, workspace, prompt, trial, schema)
            submitted = source_files(workspace)
            dump(trial / 'submitted-source.json', {name: base64.b64encode(data).decode() for name, data in submitted.items()})
            if (workspace / '.study/output').exists():
                shutil.copytree(workspace / '.study/output', trial / 'producer')
            independent = verify(node, codex, workspace, trial / 'independent', deps, baseline, support)
            inventory = json.loads((trial / 'command-inventory.json').read_bytes())
            uptake = {name: sum(linux(ROOT / filename) in item.get('command', '') for item in inventory) for name, filename in TOOLS.items()}
            receipt_path = trial / 'producer/receipt.json'
            receipt = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else None
            adequate = (record['available'] and independent['repairCorrect'] and answer is not None and answer['conclusion'] == 'pass'
                and sorted(answer['changedPaths']) == independent['changedPaths'] and receipt is not None
                and receipt['sourceStable'] and receipt['sourceHash'] == independent['sourceSha256']
                and receipt['exitCode'] == 0 and receipt['completed'] and receipt['signal'] is None
                and receipt['summary'] is not None and receipt['summary']['success']
                and receipt['summary']['counts']['tests'] > 0
                and all(receipt['summary']['counts'][key] == 0 for key in ['failed', 'skipped', 'todo', 'cancelled'])
                and sha((trial / 'producer/native.jsonl').read_bytes()) == receipt['captureSha256']
                and sha((trial / 'producer/change.diff').read_bytes()) == receipt['diffSha256'])
            record.update({'condition': condition, 'repetition': repetition, 'answer': answer, 'uptake': uptake,
                           'independent': independent, 'adequate': adequate})
            records.append(record); dump(evidence / 'measurements.json', records)
            print(f'Trial {index}/6 {condition} repetition {repetition}: available={record["available"]} repair={independent["repairCorrect"]} adequate={adequate}', flush=True)
        assert git('status', '--porcelain') == source_status and git('rev-parse', 'HEAD').decode().strip() == source_head
        assert all(sha(Path(name).read_bytes()) == value for name, value in watched.items())
        summary = {}
        for condition in ['conventional', 'tool']:
            selected = [record for record in records if record['condition'] == condition]
            measured = [record for record in selected if record['available']]
            summary[condition] = {'attempts': len(selected), 'available': len(measured),
                'correctRepairs': sum(record['independent']['repairCorrect'] for record in selected),
                'adequateAnswers': sum(record['adequate'] for record in selected),
                'medians': {key: statistics.median(record[key] for record in measured) for key in ['calls', 'returnedCommandBytes', 'elapsedMs']},
                'usageMedians': {key: statistics.median(record['usage'][key] for record in measured) for key in ['input_tokens', 'cached_input_tokens', 'output_tokens']},
                'independentVerificationMedianMs': statistics.median(record['independent']['elapsedMs'] for record in selected)}
        dump(evidence / 'summary.json', summary)
        dump(evidence / 'readback.json', {'sourceUnchanged': True, 'toolEntryPointsUnchanged': True, 'participantThreads': [record['threadIds'] for record in records]})
        print(json.dumps(summary), flush=True)
    finally:
        # Check the final absolute owned target before recursive cleanup. Never traverse dependency junctions.
        assert work.resolve().parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('repair-workflow # ')
        for junction in work.glob('*/node_modules'):
            if junction != work / 'dependencies/node_modules' and junction.exists():
                os.rmdir(junction)
        shutil.rmtree(work)
        dump(evidence / 'cleanup.json', {'temporaryRoot': str(work), 'removed': not work.exists()})


if __name__ == '__main__':
    main()
