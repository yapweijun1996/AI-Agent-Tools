"""Owner-invoked development experiment; never part of AIT or native test gates."""
import argparse
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

ROOT = Path(__file__).resolve().parent.parent
SEED = 20261008
MODEL, EFFORT = 'gpt-6.1-sol', 'xhigh'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8', newline='\n')


def tree(path):
    h = hashlib.sha256()
    for p in sorted(path.rglob('*'), key=lambda p: p.relative_to(path).as_posix()):
        if p.is_file():
            h.update(p.relative_to(path).as_posix().encode())
            h.update(b'\0'); h.update(p.read_bytes()); h.update(b'\0')
    return h.hexdigest()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def run_session(node, codex, workspace, prompt, output, schema):
    output.mkdir(parents=True)
    (output / 'prompt.txt').write_text(prompt, encoding='utf-8')
    args = [node, codex, 'exec', '--ignore-user-config', '--ephemeral', '--json',
            '--sandbox', 'read-only', '--skip-git-repo-check', '-C', str(workspace),
            '-m', MODEL, '-c', f'model_reasoning_effort="{EFFORT}"',
            '-c', 'approval_policy="never"', '-c', 'project_doc_max_bytes=0',
            '--output-schema', str(schema), '-o', str(output / 'answer.json'), '-']
    start = time.perf_counter()
    env = os.environ.copy()
    env['PATH'] = str(Path(node).parent) + os.pathsep + env['PATH']
    with (output / 'events.jsonl').open('wb') as stdout, (output / 'stderr.txt').open('wb') as stderr:
        process = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr, env=env)
        try:
            process.communicate(prompt.encode(), timeout=300)
        except subprocess.TimeoutExpired:
            # Terminate only the owned process tree, so no descendant survives cleanup.
            if os.name == 'nt':
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, check=False)
            else:
                process.kill()
            process.wait()
    elapsed = (time.perf_counter() - start) * 1000
    events = [json.loads(line) for line in (output / 'events.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    items = [e['item'] for e in events if e.get('type') == 'item.completed']
    commands = [i for i in items if i.get('type') == 'command_execution']
    uses = [e['usage'] for e in events if e.get('type') == 'turn.completed']
    forbidden = [i.get('type') for i in items if i.get('type') in ('file_change', 'web_search', 'mcp_tool_call')]
    record = {'exitCode': process.returncode, 'elapsedMs': elapsed,
              'calls': len(commands), 'returnedCommandBytes': sum(len(i.get('aggregated_output', '').encode()) for i in commands),
              'usage': uses[-1] if len(uses) == 1 else None,
              'threadIds': [e['thread_id'] for e in events if e.get('type') == 'thread.started'],
              'forbiddenEvents': forbidden, 'failedCommands': sum(i.get('exit_code') != 0 for i in commands),
              'eventsSha256': sha((output / 'events.jsonl').read_bytes()),
              'promptSha256': sha(prompt.encode()), 'answerSha256': None}
    stderr_bytes = (output / 'stderr.txt').read_bytes()
    record['stderrSha256'] = sha(stderr_bytes)
    record['executionPolicyRejected'] = b'blocked by policy' in stderr_bytes
    answer_path = output / 'answer.json'
    answer = json.loads(answer_path.read_text(encoding='utf-8')) if answer_path.exists() else None
    if answer is not None:
        record['answerSha256'] = sha(answer_path.read_bytes())
    record['available'] = (process.returncode == 0 and len(uses) == 1 and answer is not None
                           and not record['executionPolicyRejected'])
    dump(output / 'process.json', record)
    return record, answer


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--codex-js', required=True)
    parser.add_argument('--run', action='store_true', help='Explicitly invoke provider-backed fresh sessions')
    args = parser.parse_args()
    assert args.run, 'Provider-backed execution requires --run and owner authorization'
    node, codex = str(Path(args.node).resolve()), str(Path(args.codex_js).resolve())
    assert subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip() == '24.19.0'
    version = subprocess.check_output([node, codex, '--version'], text=True).strip()
    assert version == 'codex-cli 0.161.0', version
    manifest_bytes = (ROOT / 'docs/evaluation/tasks.json').read_bytes()
    manifest = json.loads(manifest_bytes)
    original = json.loads((ROOT / 'docs/evaluation/OBSERVATION_2026-10-08.json').read_bytes())
    assert sha(manifest_bytes) == original['manifestSha256']
    parent = ROOT / '.cache/agent-study'; parent.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='run-', dir=parent))
    work = Path(tempfile.mkdtemp(prefix='agent-study # '))
    snapshot = work / 'seed'; snapshot.mkdir()
    tools = {'source-navigation': ROOT / 'packages/code-slice/dist/cli/index.js',
             'test-selection': ROOT / 'packages/test-scope/dist/cli.js',
             'patch-review': ROOT / 'packages/patch-guard/src/cli.js',
             'test-acceptance': ROOT / 'packages/test-evidence/src/cli.js',
             'unfamiliar-selection': ROOT / 'packages/test-scope/dist/cli.js'}
    watched = {str(ROOT / f'packages/{folder}/{part}'): tree(ROOT / f'packages/{folder}/{part}')
               for folder, parts in [('code-slice', ['src', 'dist']), ('test-scope', ['src', 'dist']),
                                     ('patch-guard', ['src']), ('test-evidence', ['src'])] for part in parts}
    try:
        for file in manifest['files']:
            data = git('show', f"{manifest['sourceCommit']}:{file['path']}")
            assert sha(data) == file['sha256']
            target = snapshot / 'project' / file['path'].removeprefix('packages/test-evidence/')
            target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        patch = git('diff', '--no-ext-diff', '--no-textconv', manifest['patchCommit'] + '^', manifest['patchCommit'], '--', *manifest['patchPaths'])
        assert sha(patch) == manifest['patchSha256']
        (snapshot / 'review.diff').write_bytes(patch)
        dump(snapshot / 'policy.json', {'schema_version': '1.0.0', 'allowed_paths': ['bin/'], 'protected_paths': ['bin/install-all.js']})
        retained = ROOT / '.cache/task-value-evaluation/run-GvfFHU'
        capture = (retained / 'capture.jsonl').read_bytes()
        assert sha(capture) == original['collection']['captureSha256']
        for name in ['capture.jsonl', 'native.tap', 'request.json']:
            shutil.copyfile(retained / name, snapshot / name)
        heldout = {'package.json': json.dumps({'type': 'module', 'scripts': {'test': 'node --test tests/*.test.mjs tests/*.spec.mjs'}}),
                   'src/billing.mjs': 'export const bill = () => 42;',
                   'tests/helpers.mjs': "import { bill } from '../src/billing.mjs'; export const total = bill;",
                   'tests/billing.test.mjs': "import test from 'node:test'; import { total } from './helpers.mjs'; test('bill', () => total());",
                   'tests/ledger.spec.mjs': "import test from 'node:test'; import { bill } from '../src/billing.mjs'; test('ledger', () => bill());",
                   'tests/fixtures/error.mjs': "import test from 'node:test'; import { bill } from '../../src/billing.mjs'; test('runner input', () => { bill(); throw Error('fixture'); });",
                   'tests/type-contract.ts': "import { bill } from '../src/billing.mjs'; const value: number = bill();"}
        for path, text in heldout.items():
            target = snapshot / 'unfamiliar' / path
            target.parent.mkdir(parents=True, exist_ok=True); target.write_text(text + '\n', encoding='utf-8')
        fields = {'taskId': {'type': 'string'}, 'conclusion': {'type': 'string'}, 'selectedPaths': {'type': 'array', 'items': {'type': 'string'}},
                  'sourceExcerpt': {'type': 'string'}, 'reason': {'type': 'string'}, 'limitations': {'type': 'array', 'items': {'type': 'string'}},
                  'counts': {'type': ['object', 'null'], 'properties': {k: {'type': 'integer'} for k in ['tests', 'passed', 'failed', 'skipped', 'todo', 'cancelled']},
                             'required': ['tests', 'passed', 'failed', 'skipped', 'todo', 'cancelled'], 'additionalProperties': False}}
        schema = output / 'answer-schema.json'
        dump(schema, {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False})
        tasks = {
            'source-navigation': "Read project/src/index.js, retain the COMPLETE analyze function in sourceExcerpt, and explain when strict verification withholds unknown and when explicit failure wins. Do not infer business correctness.",
            'test-selection': "Changed file: project/src/index.js. Identify the tests with direct static imports of that file. Return their project-relative paths in selectedPaths and explain scope/coverage limits. Separate actual suites from fixture/helper/type-check inputs. Do not run tests.",
            'patch-review': "Inspect review.diff and policy.json. Return ALL changed paths, the policy verdict and the protected-path reason. Analysis exit success must not be treated as policy acceptance. Do not apply the patch.",
            'test-acceptance': "Inspect native.tap, capture.jsonl and request.json. Does the declared required check satisfy strict all-required-tests acceptance for the declared current source/environment? Return native counts, verdict and binding/process reasoning. Input identities are declarations, not authenticated execution facts. Do not rerun tests.",
            'unfamiliar-selection': "Changed file: unfamiliar/src/billing.mjs. Identify actual suites with direct or static transitive imports of that file. Return unfamiliar-project-relative suite paths, describe import chains and limitations, and separate fixture/helper/type-check inputs. The test command is authoritative for suite naming in this fixture. Do not run tests."}
        order = [(t, c, n) for t in tasks for c in ['conventional', 'tool'] for n in range(1, 4)]
        random.Random(SEED).shuffle(order)
        dump(output / 'registration.json', {'schemaVersion': '1.0.0', 'seed': SEED, 'order': order, 'model': MODEL, 'effort': EFFORT,
              'cli': version, 'manifestSha256': sha(manifest_bytes), 'studyProtocolSha256': sha((ROOT / 'docs/evaluation/AGENT_STUDY.md').read_bytes()),
              'harnessSha256': sha(Path(__file__).read_bytes()), 'inputSha256': tree(snapshot), 'watched': watched, 'tasks': tasks})
        print('Evidence:', output.relative_to(ROOT), flush=True)
        records, answers = [], []
        for index, (task, condition, repetition) in enumerate(order, 1):
            workspace = work / f'trial-{index:02d}'; shutil.copytree(snapshot, workspace)
            before = tree(workspace)
            common = f"Read-only bounded investigation. Allowed data root: {workspace}. Work only on the task below. You share the computer with others: preserve all files. Do not edit, install, run tests, use Git/network/MCP/KB/other agents or inspect other directories, evaluator records, config or credentials. At most six shell command calls, including at most two help/capabilities calls. Use PowerShell reads/rg or the explicitly authorized local Node CLI. No web or memory. Return the answer schema; unused sourceExcerpt is empty and counts null. Paths in answers are relative, not absolute. Describe evidence, not tool/condition names.\nTask ID: {task}\n{tasks[task]}\n"
            if condition == 'tool':
                common += f"Local tool invocation prefix: & '{node}' '{tools[task]}'\nAppend the operation and flags required by help/capabilities. Root must be the task's data directory (project or unfamiliar for selection; this workspace for patch/evidence). Test Scope supports --compact. Inspect partial/unknown/diagnostics rather than promoting them to pass. You may read task input to clarify a tool limitation.\n"
            else:
                common += "Use conventional bounded file inspection and rg; do not invoke AI-Agent-Tools analyzers. No oracle line range or expected answer is supplied.\n"
            rec, answer = run_session(node, codex, workspace, common, output / f'trial-{index:02d}', schema)
            rec.update({'task': task, 'condition': condition, 'repetition': repetition, 'index': index, 'inputUnchanged': tree(workspace) == before})
            rec['compliant'] = rec['inputUnchanged'] and not rec['forbiddenEvents'] and rec['calls'] <= 6
            records.append(rec); answers.append(answer)
            dump(output / 'trials.json', records)
            print(f"Trial {index}/30 {task} {condition}: exit {rec['exitCode']}, calls {rec['calls']}, {rec['elapsedMs']:.0f} ms", flush=True)
            assert rec['available'], 'Unavailable session; retained evidence, no automatic retry'
            assert rec['compliant'], 'Noncompliant session; retained evidence, no automatic retry'
        shuffled = list(range(len(answers))); random.Random(SEED + 1).shuffle(shuffled)
        blind = [{'id': f'answer-{n:02d}', 'answer': answers[i]} for n, i in enumerate(shuffled, 1)]
        dump(output / 'blind-map.json', {b['id']: i for b, i in zip(blind, shuffled)})
        source = (snapshot / 'project/src/index.js').read_text(encoding='utf-8')
        exact = '\n'.join(source.splitlines()[62:132]).strip()
        reference = {'sourceExcerpt': exact, 'requiredTests': manifest['tasks'][1]['requiredTests'], 'changedPaths': manifest['patchPaths'],
                     'protectedPath': 'bin/install-all.js', 'counts': original['collection']['counts'],
                     'unfamiliarTests': ['tests/billing.test.mjs', 'tests/ledger.spec.mjs']}
        properties = {'id': {'type': 'string'}, 'adequate': {'type': 'boolean'}, 'unsupportedCompletionClaim': {'type': 'boolean'}, 'reason': {'type': 'string'}}
        grade_schema = output / 'grade-schema.json'
        dump(grade_schema, {'type': 'object', 'properties': {'grades': {'type': 'array', 'items': {'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}}}, 'required': ['grades'], 'additionalProperties': False})
        grade_prompt = 'Blind-grade each answer by ID. No tools or outside context. Conditions, usage and timings are withheld. Return every ID once. Adequate requires the reference facts AND scope limitations: full exact analyze source with unknown/fail precedence; all direct-test paths without execution/coverage claims; all patch paths with violations/protected-path reasoning; native counts and strict unknown due to skip plus consistent declared binding/process with authentication caveat; unfamiliar direct/transitive suites without support inputs and without coverage guarantee. Flag unsupported claims of passed verification, business correctness or complete runtime coverage. Method/condition claims are irrelevant.\nReference:\n' + json.dumps(reference) + '\nAnswers:\n' + json.dumps(blind)
        grade_record, grades = run_session(node, codex, work, grade_prompt, output / 'grader', grade_schema)
        assert grade_record['available'] and grade_record['calls'] == 0 and not grade_record['forbiddenEvents']
        assert len(grades['grades']) == 30 and {g['id'] for g in grades['grades']} == {b['id'] for b in blind}
        mapping = {b['id']: i for b, i in zip(blind, shuffled)}
        for grade in grades['grades']:
            i = mapping[grade['id']]; a = answers[i]; rec = records[i]; task = rec['task']
            factual = (a['sourceExcerpt'].strip() == exact if task == 'source-navigation' else
                       sorted(a['selectedPaths']) == sorted(reference['requiredTests']) if task == 'test-selection' else
                       sorted(a['selectedPaths']) == sorted(reference['changedPaths']) and a['conclusion'] == 'violations' if task == 'patch-review' else
                       a['counts'] == {k: reference['counts'][k] for k in fields['counts']['required']} and a['conclusion'] == 'unknown' if task == 'test-acceptance' else
                       sorted(a['selectedPaths']) == reference['unfamiliarTests'])
            rec['grade'] = grade; rec['deterministicFacts'] = factual
            rec['gradingDisagreement'] = factual != grade['adequate']
        assert all(tree(Path(p)) == digest for p, digest in watched.items()), 'Tool files changed'
        groups = []
        for task in tasks:
            for condition in ['conventional', 'tool']:
                rows = [r for r in records if r['task'] == task and r['condition'] == condition]
                groups.append({'task': task, 'condition': condition, 'trials': len(rows), 'adequate': sum(r['grade']['adequate'] for r in rows),
                               'factuallyCorrect': sum(r['deterministicFacts'] for r in rows), 'unsupportedClaims': sum(r['grade']['unsupportedCompletionClaim'] for r in rows),
                               'medianElapsedMs': statistics.median(r['elapsedMs'] for r in rows), 'medianCalls': statistics.median(r['calls'] for r in rows),
                               'medianReturnedCommandBytes': statistics.median(r['returnedCommandBytes'] for r in rows),
                               'medianInputTokens': statistics.median(r['usage']['input_tokens'] for r in rows),
                               'medianCachedInputTokens': statistics.median(r['usage']['cached_input_tokens'] for r in rows),
                               'medianOutputTokens': statistics.median(r['usage']['output_tokens'] for r in rows)})
        result = {'schemaVersion': '1.0.0', 'groups': groups, 'trials': records, 'grader': grade_record,
                  'limitations': ['One model/settings/platform; three repeats cannot establish significance.', 'Known tasks and one authored unfamiliar fixture are reported separately.',
                                  'Prompt limits are transcript-audited, not enforced capability isolation.', 'Grading is condition-blind but method hints can remain in prose.',
                                  'CLI usage is observed session usage, not billing cost or hidden provider telemetry.']}
        dump(output / 'measurements.json', result)
        print('Study completed:', output.relative_to(ROOT), flush=True)
    finally:
        assert work.resolve().parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('agent-study # ')
        shutil.rmtree(work)


if __name__ == '__main__':
    main()
