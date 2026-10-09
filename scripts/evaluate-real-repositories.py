"""Owner-invoked fresh-session pilot on pinned real-repository source subsets."""
import argparse
import json
from pathlib import Path
import random
import runpy
import shutil
import statistics
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
CAPTURE = runpy.run_path(str(ROOT / 'scripts/evaluate-agent-study.py'))
SHA, DUMP, TREE = (CAPTURE[name] for name in ('sha', 'dump', 'tree'))
RUN_SESSION = CAPTURE['run_session']
CLI_PATH, NODE_COMMAND = CAPTURE['cli_path'], CAPTURE['node_command']
SEED = 20261009
REPOSITORIES = {
    'markdown': {
        'directory': 'Markdown-Editor', 'commit': '6b74417e28cf31987df10a962e19c3d123e66439',
        'paths': ['package.json', 'vite.config.js', 'src', 'test'],
        'changed': 'src/preview/htmlEscape.js', 'gold': ['test/htmlEscape.test.js'],
        'task': 'Identify actual Node test suites with DIRECT static imports of the changed file. '
                'This asks for direct suites, not all indirect consumers. Similar function names are insufficient evidence.',
    },
    'queue': {
        'directory': 'PWA-Queue-Now', 'commit': 'd53054faee4df485211c0a244446b9b3113290cd',
        'paths': ['package.json', 'packages/queue-core', 'packages/contracts/src', 'packages/contracts/package.json'],
        'changed': 'packages/queue-core/src/revision.ts',
        'gold': [f'packages/queue-core/test/{name}.test.ts' for name in
                 ('idempotency', 'lifecycle', 'presence', 'return-window', 'revision', 'sequence')],
        'task': 'Within packages/queue-core, identify Vitest suites with MODULE-LEVEL direct or static transitive '
                'reachability to the changed file, including barrel re-exports and .js specifiers resolved to .ts source. '
                'This does not prove assertion coverage. Vitest default include is **/*.{test,spec}.?(c|m)[jt]s?(x); '
                'no Vitest config is supplied for this subset. Separate the independently invoked dist smoke script '
                'from this Vitest-suite question.',
    },
}


def git(repository, *args):
    return subprocess.check_output(['git', '-C', str(repository), *args])


def freeze(spec, destination):
    repository = ROOT.parent / spec['directory']
    assert not git(repository, 'status', '--porcelain'), 'Protect unrelated repository work; clean source required'
    assert git(repository, 'rev-parse', 'HEAD').decode().strip() == spec['commit']
    files = git(repository, 'ls-tree', '-r', '--name-only', spec['commit'], '--', *spec['paths']).decode().splitlines()
    entries = []
    for name in files:
        path = Path(name)
        if path.suffix not in ('.js', '.jsx', '.mjs', '.ts', '.tsx', '.json'):
            continue
        data = git(repository, 'show', f"{spec['commit']}:{name}")
        assert len(data) <= 512 * 1024 and len(entries) < 256, 'Bound the selected source subset'
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        entries.append({'path': name, 'sha256': SHA(data), 'bytes': len(data)})
    assert sum(entry['bytes'] for entry in entries) <= 1024 * 1024
    assert all((destination / path).is_file() for path in [spec['changed'], *spec['gold']])
    return {'commit': spec['commit'], 'files': entries, 'sha256': TREE(destination),
            'omitted': 'Unselected applications, dependencies, generated output, assets and configuration are absent.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--node', required=True)
    parser.add_argument('--codex-js', required=True)
    parser.add_argument('--wsl-distro', choices=['Ubuntu'], required=True)
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    assert args.run, 'Provider-backed sessions require the owner-selected research and explicit --run'
    for function in (RUN_SESSION, CLI_PATH, NODE_COMMAND):
        function.__globals__['WSL_DISTRO'] = args.wsl_distro
    node, codex = str(Path(args.node).resolve()), str(Path(args.codex_js).resolve())
    assert subprocess.check_output(NODE_COMMAND(node, ['-p', 'process.versions.node']), text=True).strip() == '24.19.0'
    assert subprocess.check_output(NODE_COMMAND(node, [CLI_PATH(codex), '--version']), text=True).strip() == 'codex-cli 0.161.0'
    parent = ROOT / '.cache/agent-study'; parent.mkdir(parents=True, exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='real-repositories-', dir=parent))
    work = Path(tempfile.mkdtemp(prefix='real-repositories # '))
    tool = ROOT / 'packages/test-scope/dist/cli.js'
    watched = {str(ROOT / f'packages/test-scope/{part}'): TREE(ROOT / f'packages/test-scope/{part}') for part in ('src', 'dist')}
    try:
        inputs = {}
        for task, spec in REPOSITORIES.items():
            inputs[task] = freeze(spec, work / 'seed' / task)
        fields = {'taskId': {'type': 'string'}, 'selectedPaths': {'type': 'array', 'items': {'type': 'string'}},
                  'reason': {'type': 'string'}, 'limitations': {'type': 'array', 'items': {'type': 'string'}}}
        schema = output / 'answer-schema.json'
        DUMP(schema, {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False})
        order = [(task, condition, n) for task in REPOSITORIES for condition in ('conventional', 'tool') for n in range(1, 4)]
        random.Random(SEED).shuffle(order)
        DUMP(output / 'registration.json', {'schemaVersion': '1.0.0', 'seed': SEED, 'order': order, 'inputs': inputs,
             'model': CAPTURE['MODEL'], 'effort': CAPTURE['EFFORT'], 'cli': '0.161.0', 'node': '24.19.0',
             'executionEnvironment': 'Ubuntu WSL on C: mounted subsets', 'watched': watched,
             'protocolSha256': SHA((ROOT / 'docs/evaluation/REAL_REPOSITORY_PILOT.md').read_bytes()),
             'harnessSha256': SHA(Path(__file__).read_bytes()),
             'captureHarnessSha256': SHA((ROOT / 'scripts/evaluate-agent-study.py').read_bytes())})
        for source, name in [(Path(__file__), 'harness-snapshot.py'),
                             (ROOT / 'scripts/evaluate-agent-study.py', 'capture-snapshot.py'),
                             (ROOT / 'docs/evaluation/REAL_REPOSITORY_PILOT.md', 'protocol-snapshot.md')]:
            (output / name).write_bytes(source.read_bytes())
        print('Evidence:', output.relative_to(ROOT), flush=True)
        records, answers = [], []
        for index, (task, condition, repetition) in enumerate(order, 1):
            spec = REPOSITORIES[task]
            workspace = work / f'trial-{index:02d}'
            shutil.copytree(work / 'seed' / task, workspace)
            before = TREE(workspace)
            prompt = f"Read-only bounded investigation. Task ID: {task}. Allowed data root: {CLI_PATH(workspace)}. "
            prompt += 'You share this computer: preserve every file. At most six shell calls, including at most two help/capabilities calls. '
            prompt += 'No edits, installs, tests, Git, network, MCP, KB, other agents or evaluator/config/credential inspection. '
            prompt += 'Use POSIX bounded reads/searches or the explicitly supplied local analyzer. Return root-relative paths, '
            prompt += 'evidence reasoning and static/subset limitations. Do not claim tests were run, passed, or prove complete coverage. '
            prompt += 'The input is a pinned source subset; dependencies, generated output and other applications/configuration are omitted.\n'
            prompt += f"Changed file: {spec['changed']}\n{spec['task']}\n"
            if condition == 'tool':
                prompt += f"Local Test Scope prefix: '{CLI_PATH(node)}' '{CLI_PATH(tool)}'. Append operation/flags learned from help/capabilities. "
                prompt += 'You MUST invoke this analyzer with the plan operation at least once for this task. '
                prompt += 'Use this data root. --compact is supported. Inspect partial status, recommendations, evidence and diagnostics; '
                prompt += 'runner naming and the requested import scope remain authoritative. Ordinary input inspection may clarify limitations.\n'
            else:
                prompt += 'Use conventional reads and rg only; do not invoke AI-Agent-Tools analyzers.\n'
            record, answer = RUN_SESSION(node, codex, workspace, prompt, output / f'trial-{index:02d}', schema)
            record.update({'index': index, 'task': task, 'condition': condition, 'repetition': repetition,
                           'inputUnchanged': TREE(workspace) == before})
            events = [json.loads(line) for line in (output / f'trial-{index:02d}' / 'events.jsonl').read_text(encoding='utf-8').splitlines()] if record['available'] else []
            commands = [event['item']['command'] for event in events if event.get('type') == 'item.completed'
                        and event.get('item', {}).get('type') == 'command_execution']
            record['toolPlanAttempted'] = any(CLI_PATH(tool) in command and ' plan ' in command for command in commands)
            record['discoveryCalls'] = sum(CLI_PATH(tool) in command and (' --help' in command or ' capabilities ' in command) for command in commands)
            record['compliant'] = (record['inputUnchanged'] and not record['forbiddenEvents'] and record['calls'] <= 6
                                   and record['discoveryCalls'] <= 2
                                   and (record['toolPlanAttempted'] if condition == 'tool' else not any(CLI_PATH(tool) in command for command in commands)))
            records.append(record); answers.append(answer)
            DUMP(output / 'trials.json', records)
            print(f"Trial {index}/12 {task} {condition}: available {record['available']}, calls {record['calls']}", flush=True)
            assert record['available'] and record['compliant'], 'Retain unavailable/noncompliant attempt; no automatic replacement'
        shuffled = list(range(len(answers))); random.Random(SEED + 1).shuffle(shuffled)
        blind = [{'id': f'answer-{n:02d}', 'answer': answers[i]} for n, i in enumerate(shuffled, 1)]
        DUMP(output / 'blind-map.json', {entry['id']: index for entry, index in zip(blind, shuffled)})
        properties = {'id': {'type': 'string'}, 'adequate': {'type': 'boolean'},
                      'unsupportedCompletionClaim': {'type': 'boolean'}, 'reason': {'type': 'string'}}
        grade_schema = output / 'grade-schema.json'
        DUMP(grade_schema, {'type': 'object', 'properties': {'grades': {'type': 'array', 'items': {
            'type': 'object', 'properties': properties, 'required': list(properties), 'additionalProperties': False}}},
            'required': ['grades'], 'additionalProperties': False})
        references = {task: {'paths': spec['gold'], 'task': spec['task']} for task, spec in REPOSITORIES.items()}
        prompt = 'Blind-grade every answer ID once. No tools or outside context. Conditions, usage and timings are withheld. '
        prompt += 'Adequate requires the exact root-relative suite set, correct runner/import reasoning and explicit static/subset limitations. '
        prompt += 'Markdown is DIRECT imports only; a same-named local function elsewhere is insufficient. Queue module-level reachability '
        prompt += 'includes index.ts re-exporting revision.ts, all six suites importing index.js resolved to index.ts, and excludes dist-smoke.mjs '
        prompt += 'from the requested Vitest scope. Do not require assertions of symbol-level coverage. Flag unsupported claims of executed or '
        prompt += 'passed tests, complete coverage or business correctness. Method names are irrelevant.\nReferences:\n'
        prompt += json.dumps(references) + '\nAnswers:\n' + json.dumps(blind)
        grader, grades = RUN_SESSION(node, codex, work, prompt, output / 'grader', grade_schema)
        assert grader['available'] and grader['calls'] == 0 and not grader['forbiddenEvents']
        assert len(grades['grades']) == 12 and {grade['id'] for grade in grades['grades']} == {entry['id'] for entry in blind}
        mapping = {entry['id']: index for entry, index in zip(blind, shuffled)}
        for grade in grades['grades']:
            index = mapping[grade['id']]; record = records[index]
            record['grade'] = grade
            record['deterministicFacts'] = sorted(answers[index]['selectedPaths']) == sorted(REPOSITORIES[record['task']]['gold'])
            record['gradingDisagreement'] = record['deterministicFacts'] != grade['adequate']
        assert all(TREE(Path(path)) == digest for path, digest in watched.items()), 'Tool source/runtime changed'
        assert all(TREE(work / 'seed' / task) == evidence['sha256'] for task, evidence in inputs.items())
        groups = []
        for task in REPOSITORIES:
            for condition in ('conventional', 'tool'):
                rows = [record for record in records if record['task'] == task and record['condition'] == condition]
                group = {'task': task, 'condition': condition, 'trials': len(rows),
                         'adequate': sum(record['grade']['adequate'] for record in rows),
                         'factuallyCorrect': sum(record['deterministicFacts'] for record in rows),
                         'unsupportedClaims': sum(record['grade']['unsupportedCompletionClaim'] for record in rows)}
                for field in ('elapsedMs', 'calls', 'returnedCommandBytes'):
                    group['median' + field[0].upper() + field[1:]] = statistics.median(record[field] for record in rows)
                for field in ('input_tokens', 'cached_input_tokens', 'output_tokens'):
                    group['median' + ''.join(part.title() for part in field.split('_'))] = statistics.median(record['usage'][field] for record in rows)
                groups.append(group)
        DUMP(output / 'measurements.json', {'schemaVersion': '1.0.0', 'inputs': inputs, 'groups': groups,
             'trials': records, 'grader': grader, 'limitations': [
                 'Two selected owned source subsets, not a random repository sample.',
                 'Static suite selection only; no test execution or complete workflow.',
                 'One requested model/settings/environment and three repeats; no significance or causal productivity claim.',
                 'Prompt limits and emitted events are not proof of OS isolation or backend state.']})
        print('Pilot completed:', output.relative_to(ROOT), flush=True)
    finally:
        assert work.resolve().parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('real-repositories # ')
        shutil.rmtree(work)


if __name__ == '__main__':
    main()
