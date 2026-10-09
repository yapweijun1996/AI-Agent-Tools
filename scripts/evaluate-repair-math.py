"""Owner-invoked isolated, interleaved second historical repair study."""
import argparse
import base64
import json
import os
from pathlib import Path
import random
import runpy
import shutil
import statistics
import subprocess
import tempfile
import time
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS = runpy.run_path(str(ROOT / 'scripts/evaluate-repair-workflow.py'))
sha, dump, linux, git = (PREVIOUS[name] for name in ['sha', 'dump', 'linux', 'git'])
source_files, fingerprint, changes, parse_session = (
    PREVIOUS[name] for name in ['source_files', 'fingerprint', 'changes', 'parse_session'])
COMMIT = '5214c9554f8b118fe60fa44ac563e5f785c410e4'
REFERENCE = '094478786ca427f82cab977c9f98a1e4cfd5bad6'
MODEL, EFFORT, SEED = 'gpt-6.1-sol', 'xhigh', 20261011
ALLOWED = {'src/preview/mathRenderer.js', 'test/mathSafety.test.js'}
TOOLS = PREVIOUS['TOOLS']


def toml(value):
    if isinstance(value, dict):
        return '{' + ','.join(json.dumps(key) + '=' + toml(item) for key, item in value.items()) + '}'
    if isinstance(value, list):
        return '[' + ','.join(toml(item) for item in value) + ']'
    if isinstance(value, bool):
        return str(value).lower()
    return json.dumps(value)


def interleaved_order(seed=SEED):
    first = random.Random(seed).choice(['conventional', 'tool'])
    second = 'tool' if first == 'conventional' else 'conventional'
    return [(condition, repetition) for repetition in range(1, 4) for condition in [first, second]]


def reporter_url(path):
    return 'file://' + quote(linux(path), safe='/')


def profile(node, codex, deps, tools, acceptance=False):
    filesystem = {':root': 'deny', ':minimal': 'read', ':tmpdir': 'deny', ':slash_tmp': 'deny',
                  linux(node.parents[1]): 'read', linux(codex.parents[2] / 'codex-linux-x64'): 'read',
                  linux(deps): 'read', linux(tools): 'read',
                  ':workspace_roots': {'.': 'write', 'src': 'read', 'src/preview': 'write', 'test': 'write',
                      '.study': 'read', '.study/output': 'write',
                      'package.json': 'read', 'package-lock.json': 'read'}}
    if acceptance:
        filesystem[linux(ROOT / 'scripts/repair-math-acceptance.mjs')] = 'read'
    return {'extends': ':workspace', 'filesystem': filesystem, 'network': {'enabled': False}}


def summary(directory):
    records = [json.loads(line) for line in (directory / 'stdout').read_bytes().splitlines() if line]
    summaries = [record for record in records if record.get('type') == 'summary']
    return summaries[0] if len(summaries) == 1 else None


def strict_pass(record):
    counts = (record.get('summary') or {}).get('counts', {})
    return (record['exitCode'] == 0 and (record.get('summary') or {}).get('success') is True
            and counts.get('tests', 0) > 0
            and all(counts.get(key) == 0 for key in ['failed', 'skipped', 'todo', 'cancelled']))


class Study:
    def __init__(self, node, codex, work, evidence):
        self.node, self.codex, self.work, self.evidence = node, codex, work, evidence
        self.deps, self.tools = work / 'dependencies', work / 'tools'
        self.path = linux(node.parent) + ':/usr/local/bin:/usr/bin:/bin'
        self.permissions = profile(node, codex, self.deps, self.tools)
        self.tool_paths = {name: self.tools / filename for name, filename in TOOLS.items()}

    def native(self, cwd, arguments, directory, acceptance=False):
        directory.mkdir(parents=True, exist_ok=True)
        policy = profile(self.node, self.codex, self.deps, self.tools, acceptance)
        argv = ['wsl.exe', '-d', 'Ubuntu', '--exec', 'timeout', '--kill-after=5', '65s',
                'env', 'PATH=' + self.path, linux(self.node), linux(self.codex), 'sandbox',
                '-P', 'study', '--include-managed-config', '-C', linux(cwd),
                '-c', 'permissions.study=' + toml(policy),
                'env', '-i', 'PATH=' + self.path, 'HOME=' + linux(cwd / '.study/empty-home')]
        if acceptance:
            argv.append('REPAIR_PROJECT=' + linux(cwd))
        argv.extend([linux(self.node), *arguments])
        started = time.perf_counter()
        process = subprocess.run(argv, capture_output=True, timeout=75)
        (directory / 'stdout').write_bytes(process.stdout)
        (directory / 'stderr').write_bytes(process.stderr)
        result = {'argv': argv, 'exitCode': process.returncode,
                  'elapsedMs': (time.perf_counter() - started) * 1000,
                  'stdoutSha256': sha(process.stdout), 'stderrSha256': sha(process.stderr)}
        dump(directory / 'process.json', result)
        return result

    def session(self, workspace, prompt, directory, schema, skills):
        directory.mkdir()
        (directory / 'prompt.txt').write_bytes(prompt.encode())
        overrides = {'approval_policy': 'never', 'default_permissions': 'study',
                     'permissions.study': self.permissions, 'project_doc_max_bytes': 0,
                     'model_reasoning_effort': EFFORT, 'web_search': 'disabled',
                     'skills.config': [{'path': path, 'enabled': False} for path in skills],
                     'shell_environment_policy.inherit': 'none',
                     'shell_environment_policy.set': {'PATH': self.path,
                         'HOME': linux(workspace / '.study/empty-home')}}
        argv = ['wsl.exe', '-d', 'Ubuntu', '--exec', 'timeout', '--kill-after=5', '895s',
                'env', 'PATH=' + self.path, linux(self.node), linux(self.codex),
                'exec', '--ignore-user-config', '--strict-config', '--ephemeral', '--json',
                '--skip-git-repo-check', '-C', linux(workspace), '-m', MODEL]
        for key, value in overrides.items():
            argv.extend(['-c', key + '=' + toml(value)])
        argv.extend(['--output-schema', linux(schema), '-o', linux(directory / 'answer.json'), '-'])
        started = time.perf_counter()
        with (directory / 'events.jsonl').open('wb') as out, (directory / 'stderr.txt').open('wb') as err:
            process = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=out, stderr=err)
            try:
                process.communicate(prompt.encode(), timeout=900)
            except subprocess.TimeoutExpired:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], capture_output=True, check=False)
                process.wait()
        return parse_session(directory, process.returncode, (time.perf_counter() - started) * 1000, argv)

    def verify(self, workspace, directory, baseline, support):
        started = time.perf_counter()
        submitted = source_files(workspace)
        changed = changes(baseline, submitted)
        stable = all((workspace / name).read_bytes() == data for name, data in support.items())
        stable = stable and all(file.relative_to(workspace).as_posix() in support
            for file in (workspace / '.study').rglob('*')
            if file.is_file() and 'output' not in file.relative_to(workspace / '.study').parts)
        result = {'changedPaths': changed, 'protectedChanges': [p for p in changed if p not in ALLOWED],
                  'supportStable': stable, 'sourceSha256': fingerprint(submitted),
                  'sourceStable': False, 'repairCorrect': False, 'native': None, 'acceptance': None}
        if not result['protectedChanges'] and stable:
            reporter = reporter_url(self.tools / 'packages/test-evidence/src/node-reporter.js')
            tests = sorted('test/' + p.name for p in (workspace / 'test').glob('*.test.js'))
            for kind, arguments in [
                ('native', tests), ('acceptance', [linux(ROOT / 'scripts/repair-math-acceptance.mjs')]),
            ]:
                record = self.native(workspace, ['--experimental-vm-modules', '--test', '--test-isolation=none',
                    '--test-reporter=' + reporter, *arguments], directory / kind, acceptance=kind == 'acceptance')
                record['summary'] = summary(directory / kind)
                record['strictPass'] = strict_pass(record)
                result[kind] = record
            result['sourceStable'] = submitted == source_files(workspace)
            result['repairCorrect'] = (result['sourceStable'] and 'test/mathSafety.test.js' in submitted
                and result['native']['strictPass'] and result['acceptance']['strictPass'])
        result['elapsedMs'] = (time.perf_counter() - started) * 1000
        dump(directory / 'result.json', result)
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true')
    parser.add_argument('--node', required=True)
    parser.add_argument('--codex-js', required=True)
    args = parser.parse_args()
    assert args.run, 'Explicit owner invocation and --run required'
    node, codex = Path(args.node).resolve(), Path(args.codex_js).resolve()
    assert not git('status', '--porcelain'), 'Protect unrelated source work'
    source_head = git('rev-parse', 'HEAD').decode().strip()
    frozen = {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in
        [*ROOT.glob('docs/evaluation/REPAIR_WORKFLOW*'), ROOT / 'scripts/evaluate-repair-workflow.py',
         ROOT / 'scripts/repair-workflow-collect.mjs', ROOT / 'scripts/repair-workflow-acceptance.mjs',
         ROOT / 'tests/test_repair_workflow.py']}
    parent = ROOT / '.cache/repair-math'; parent.mkdir(exist_ok=True)
    evidence = Path(tempfile.mkdtemp(prefix='run-', dir=parent))
    work = Path(tempfile.mkdtemp(prefix='repair-math # '))
    print('Evidence:', evidence.relative_to(ROOT), flush=True)
    dump(evidence / 'ownership.json', {'temporaryRoot': str(work), 'sourceHead': source_head,
                                      'sourceRepository': str(PREVIOUS['SOURCE'])})
    try:
        study = Study(node, codex, work, evidence)
        study.deps.mkdir(); study.tools.mkdir()
        for package, directories in {'code-slice': ['dist', 'grammars/wasm', 'schemas', 'node_modules/web-tree-sitter'],
            'test-scope': ['dist', 'schemas'], 'patch-guard': ['src', 'schema'],
            'test-evidence': ['src', 'schema']}.items():
            source = ROOT / 'packages' / package
            target = study.tools / 'packages' / package
            target.mkdir(parents=True)
            shutil.copyfile(source / 'package.json', target / 'package.json')
            for directory in directories:
                shutil.copytree(source / directory, target / directory)
        seed = work / 'seed'; seed.mkdir()
        baseline = {}
        for name in git('ls-tree', '-r', '--name-only', COMMIT, '--', 'src', 'test', 'package.json', 'package-lock.json').decode().splitlines():
            data = git('show', f'{COMMIT}:{name}')
            assert len(data) < 1024 * 1024 and len(baseline) < 256
            baseline[name] = data
            target = seed / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        assert not any(name.endswith('AGENTS.md') for name in baseline)
        for name in ['package.json', 'package-lock.json']:
            (study.deps / name).write_bytes(baseline[name])
        skills_result = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--exec', 'find',
            '/home/tno/.codex/skills', '-maxdepth', '4', '-name', 'SKILL.md'], capture_output=True, check=True)
        skills = sorted(str(Path(path).parent).replace('\\', '/') for path in skills_result.stdout.decode().splitlines())
        dump(evidence / 'skill-discovery.json', {'pathsOnly': True, 'disabledPaths': skills})
        cli_version = subprocess.check_output(['wsl.exe', '-d', 'Ubuntu', '--exec', linux(node), linux(codex), '--version']).decode().strip()
        assert cli_version == 'codex-cli 0.161.0'
        fields = {'conclusion': {'type': 'string', 'enum': ['pass', 'fail', 'unknown']},
                  'changedPaths': {'type': 'array', 'items': {'type': 'string'}},
                  'testsRun': {'type': 'array', 'items': {'type': 'string'}},
                  'reason': {'type': 'string'}, 'limitations': {'type': 'array', 'items': {'type': 'string'}}}
        schema = evidence / 'answer-schema.json'
        dump(schema, {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False})
        probe = work / 'preflight'; probe.mkdir()
        (probe / '.study/empty-home').mkdir(parents=True)
        (probe / '.study/output').mkdir()
        (probe / 'src/preview').mkdir(parents=True)
        (probe / 'src/preview/mathRenderer.js').write_text('export {};\n', encoding='utf-8')
        sentinels = [work / 'outside.txt', work / 'AGENTS.md']
        for sentinel in sentinels:
            sentinel.write_text('Non-sensitive isolation sentinel\n', encoding='utf-8')
        # No personal Skill or credential content is read: only test whether opening is denied.
        forbidden = [linux(p) for p in sentinels] + ['/home/tno/.codex/skills/vanilla-web-frontend/SKILL.md']
        (probe / 'probe.test.mjs').write_text(
            "import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';\n"
            + "test('inside write',()=>{fs.writeFileSync('marker.txt','ready\\n');assert.equal(fs.readFileSync('marker.txt','utf8'),'ready\\n')});\n"
            + ''.join("test('outside-denied-" + str(i) + "',()=>assert.throws(()=>fs.openSync(" + json.dumps(p)
                + ",'r'),e=>['EACCES','EPERM','ENOENT'].includes(e.code)));\n" for i, p in enumerate(forbidden)), encoding='utf-8')
        preflight = study.native(probe, ['--test', '--test-isolation=none',
            '--test-reporter=' + reporter_url(study.tools / 'packages/test-evidence/src/node-reporter.js'),
            'probe.test.mjs'], evidence / 'controls/isolation')
        assert preflight['exitCode'] == 0, 'Read confinement unavailable; do not weaken the profile'
        assert summary(evidence / 'controls/isolation')['counts'] == {
            'tests': 4, 'suites': 0, 'passed': 4, 'failed': 0, 'skipped': 0, 'todo': 0, 'cancelled': 0}
        record, answer = study.session(probe,
            'Authorized isolation preflight, not a repair trial. Run node --test --test-isolation=none probe.test.mjs inside this fixture only. '
            'Do not read any other files, rules, Skills, credentials or history; no network, policy changes or delegation. '
            'Return conclusion pass only when the four test cases all pass, changedPaths ["marker.txt"], actual testsRun, reason and limitations.',
            evidence / 'preflight', schema, skills)
        assert record['available'] and answer['conclusion'] == 'pass', 'Authorized CLI preflight unavailable'
        assert any('tests 4' in command['aggregated_output'] for command in
            json.loads((evidence / 'preflight/command-inventory.json').read_bytes())), 'CLI must retain individual test counts'
        npm = node.parents[1] / 'lib/node_modules/npm/bin/npm-cli.js'
        started = time.perf_counter()
        installed = subprocess.run(['wsl.exe', '-d', 'Ubuntu', '--cd', linux(study.deps), '--exec',
            'timeout', '--kill-after=5', '240s', 'env', 'PATH=' + study.path, linux(node), linux(npm),
            'ci', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], capture_output=True, timeout=250)
        (evidence / 'dependency.stdout').write_bytes(installed.stdout)
        (evidence / 'dependency.stderr').write_bytes(installed.stderr)
        dump(evidence / 'dependency.json', {'exitCode': installed.returncode, 'ignoreScripts': True,
            'elapsedMs': (time.perf_counter() - started) * 1000, 'lockSha256': sha(baseline['package-lock.json'])})
        assert installed.returncode == 0
        collector = (ROOT / 'scripts/repair-workflow-collect.mjs').read_bytes()
        needle = b"const argv = ['--test',"
        assert collector.count(needle) == 1
        collector = collector.replace(needle, b"const argv = ['--experimental-vm-modules', '--test',")
        support = {'.study/collect.mjs': collector,
            '.study/baseline.json': (json.dumps({name: base64.b64encode(data).decode() for name, data in baseline.items()}) + '\n').encode(),
            '.study/settings.json': (json.dumps({'commit': COMMIT,
                'reporter': linux(study.tools / 'packages/test-evidence/src/node-reporter.js'),
                'reporterVersion': json.loads((ROOT / 'packages/test-evidence/package.json').read_bytes())['version']}) + '\n').encode(),
            '.study/policy.json': (json.dumps({'schema_version': '1.0.0', 'allowed_paths': sorted(ALLOWED),
                'protected_paths': ['package.json', 'package-lock.json', '.study/']}) + '\n').encode()}
        for name, data in support.items():
            target = seed / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        (seed / '.study/output').mkdir()
        (seed / '.study/empty-home').mkdir()
        for name, filename in [('harness-snapshot.py', Path(__file__)), ('protocol-snapshot.md', ROOT / 'docs/evaluation/REPAIR_MATH_PROTOCOL.md'),
            ('acceptance-snapshot.mjs', ROOT / 'scripts/repair-math-acceptance.mjs')]:
            shutil.copyfile(filename, evidence / name)
        (evidence / 'collector-snapshot.mjs').write_bytes(collector)
        watched = {filename: sha((ROOT / filename).read_bytes()) for filename in TOOLS.values()}
        registration = {'schemaVersion': '1.0.0', 'seed': SEED, 'order': interleaved_order(), 'model': MODEL,
            'effort': EFFORT, 'cli': cli_version, 'runtime': 'Ubuntu WSL Node 24.19.0', 'sourceCommit': COMMIT,
            'historicalFix': REFERENCE, 'sourceHead': source_head, 'baselineSha256': fingerprint(baseline),
            'protocolSha256': sha((evidence / 'protocol-snapshot.md').read_bytes()),
            'harnessSha256': sha((evidence / 'harness-snapshot.py').read_bytes()),
            'acceptanceSha256': sha((evidence / 'acceptance-snapshot.mjs').read_bytes()),
            'supportSha256': {name: sha(data) for name, data in support.items()}, 'previousFrozen': frozen,
            'toolEntries': watched, 'permissions': study.permissions, 'disabledSkills': skills,
            'toolBundleSha256': {p.relative_to(study.tools).as_posix(): sha(p.read_bytes()) for p in study.tools.rglob('*') if p.is_file()}}
        dump(evidence / 'registration.json', registration)
        def clone(name):
            target = work / name; shutil.copytree(seed, target)
            subprocess.run(['cmd', '/c', 'mklink', '/J', str(target / 'node_modules'), str(study.deps / 'node_modules')], capture_output=True, check=True)
            return target
        baseline_result = study.verify(clone('baseline-control'), evidence / 'controls/baseline', baseline, support)
        assert baseline_result['native']['strictPass']
        assert baseline_result['acceptance']['exitCode'] == 1
        assert baseline_result['acceptance']['summary']['counts']['tests'] == 18
        assert baseline_result['acceptance']['summary']['counts']['failed'] > 0
        reference = clone('reference-control')
        (reference / 'src/preview/mathRenderer.js').write_bytes(git('show', f'{REFERENCE}:src/preview/mathRenderer.js'))
        (reference / 'test/mathSafety.test.js').write_bytes(git('show', f'{REFERENCE}:test/mathRenderer.test.js'))
        reference_result = study.verify(reference, evidence / 'controls/reference', baseline, support)
        assert reference_result['repairCorrect'] and reference_result['acceptance']['summary']['counts']['tests'] == 18
        producer = study.native(reference, ['.study/collect.mjs'], evidence / 'controls/producer')
        assert producer['exitCode'] == 0
        for name, arguments in [('patch', ['check', '--root', '.', '--diff', '.study/output/change.diff',
                '--policy', '.study/policy.json', '--origin', 'snapshot', '--json']),
                ('evidence', ['verify', '--root', '.', '--input', '.study/output/request.json', '--json'])]:
            result = study.native(reference, [linux(study.tool_paths[name]), *arguments], evidence / ('controls/' + name))
            envelope = json.loads((evidence / ('controls/' + name) / 'stdout').read_bytes())
            assert result['exitCode'] == 0 and envelope['status'] == 'ok' and envelope['data']['verdict'] == 'pass'
        dump(evidence / 'control-counts.json', {name: {kind: result[kind]['summary']['counts'] for kind in ['native', 'acceptance']}
            for name, result in [('baseline', baseline_result), ('reference', reference_result)]})
        runtime = study.native(reference, ['-p', 'JSON.stringify({node:process.versions.node})'], evidence / 'controls/runtime')
        assert runtime['exitCode'] == 0 and json.loads((evidence / 'controls/runtime/stdout').read_bytes())['node'] == '24.19.0'
        print('Isolation, CLI, baseline, reference and producer controls passed; starting six interleaved sessions.', flush=True)
        common = (
            'Repair this isolated historical Markdown-Editor math module. No history or solution is supplied. '
            'Math detection must ignore inline/backtick/tilde fenced code, escaped dollars and currency such as Cost $5 and $6, '
            'while finding ordinary $x^2$ and $$x^2$$. HTML math rendering must transform visible text only, preserve '
            'code/pre content, attribute bytes and already-rendered KaTeX; preserve ordinary markup and currency. '
            'Render visible inline and paragraph display math with the appropriate mode. Decode Markdown HTML entities '
            'such as &lt; and &amp; for the equation source. An unavailable CSS asset must not prevent KaTeX HTML rendering. '
            'Keep public exports and lazy loading. Only edit src/preview/mathRenderer.js and add meaningful regressions '
            'in test/mathSafety.test.js. Preserve all other source, existing tests, metadata, lock and .study support. '
            'Use final newlines. Read/search and edit only this fixture and its locked read-only dependencies. '
            'Do not read outside rules/Skills, ancestors, other trials, evaluator code, .study/baseline.json or history; '
            'do not use Git, network, credentials, installs, delegation, policy changes or escalation. '
            'The explicit analyzer entry points below are the only extra authorized tools in the tool condition. '
            'Execute ALL native tests: node --experimental-vm-modules --test --test-isolation=none test/*.test.js. '
            'Use the isolation flag to retain individual cases under this sandbox. After editing/testing run '
            'node .study/collect.mjs. Inspect .study/output/change.diff, receipt.json and request.json and .study/policy.json. '
            'Collector executes native tests and binds actual source/process declarations; it does not decide acceptance. '
            'Only conclude pass for a permitted patch, stable current source, complete zero-exit nonzero successful tests '
            'without failure/skip/todo/cancelled. Exit zero alone is insufficient. This is module evidence, not full '
            'application/browser/security/business acceptance; declarations are not authenticated execution identities. '
            'Return the schema fields conclusion, actual project-relative changedPaths, testsRun, reason and limitations. '
            'Deadline 900 seconds. Preserve unknown when evidence is missing.\n')
        records = []
        for index, (condition, repetition) in enumerate(interleaved_order(), 1):
            workspace = clone(f'trial-{index:02d}')
            prompt = common
            if condition == 'conventional':
                prompt += 'Condition: ordinary workflow. Do not invoke AI-Agent-Tools analyzers. Reason from source, tests and the actual producer outputs.\n'
            else:
                command = {name: 'node ' + json.dumps(linux(path)) for name, path in study.tool_paths.items()}
                prompt += ('Condition: four-tool workflow. Attempt all four analyzers at relevant stages and inspect native statuses/verdicts. '
                    f'Code Slice: {command["slice"]} outline src/preview/mathRenderer.js --root . --compact --json. '
                    f'Test Scope: {command["scope"]} plan --root . --changed src/preview/mathRenderer.js --compact; '
                    'still run all native tests even if scope is incomplete. After collection, '
                    f'Patch Guard: {command["patch"]} check --root . --diff .study/output/change.diff --policy .study/policy.json --origin snapshot --json. '
                    f'Test Evidence: {command["evidence"]} verify --root . --input .study/output/request.json --json.\n')
            trial = evidence / f'trial-{index:02d}'
            record, answer = study.session(workspace, prompt, trial, schema, skills)
            submitted = source_files(workspace)
            dump(trial / 'submitted-source.json', {name: base64.b64encode(data).decode() for name, data in submitted.items()})
            shutil.copytree(workspace / '.study/output', trial / 'producer')
            independent = study.verify(workspace, trial / 'independent', baseline, support)
            inventory = json.loads((trial / 'command-inventory.json').read_bytes())
            uptake = {name: sum(linux(path) in item.get('command', '') for item in inventory) for name, path in study.tool_paths.items()}
            receipt_path = trial / 'producer/receipt.json'
            receipt = json.loads(receipt_path.read_bytes()) if receipt_path.exists() else None
            adequate = bool(record['available'] and independent['repairCorrect'] and answer and answer['conclusion'] == 'pass'
                and sorted(answer['changedPaths']) == independent['changedPaths'] and receipt
                and receipt['sourceStable'] and receipt['sourceHash'] == independent['sourceSha256']
                and receipt['completed'] and receipt['signal'] is None and receipt['exitCode'] == 0
                and strict_pass({'exitCode': receipt['exitCode'], 'summary': receipt['summary']})
                and sha((trial / 'producer/native.jsonl').read_bytes()) == receipt['captureSha256']
                and sha((trial / 'producer/change.diff').read_bytes()) == receipt['diffSha256'])
            record.update({'condition': condition, 'repetition': repetition, 'answer': answer, 'uptake': uptake,
                           'independent': independent, 'adequate': adequate})
            records.append(record); dump(evidence / 'measurements.json', records)
            print(f'Trial {index}/6 {condition}: available={record["available"]} correct={independent["repairCorrect"]} adequate={adequate}', flush=True)
        assert not git('status', '--porcelain') and git('rev-parse', 'HEAD').decode().strip() == source_head
        assert all(sha((ROOT / name).read_bytes()) == value for name, value in frozen.items())
        assert all(sha((ROOT / name).read_bytes()) == value for name, value in watched.items())
        assert registration['toolBundleSha256'] == {p.relative_to(study.tools).as_posix(): sha(p.read_bytes()) for p in study.tools.rglob('*') if p.is_file()}
        summary_result = {}
        for condition in ['conventional', 'tool']:
            selected = [r for r in records if r['condition'] == condition]
            measured = [r for r in selected if r['available']]
            summary_result[condition] = {'attempts': len(selected), 'available': len(measured),
                'correctRepairs': sum(r['independent']['repairCorrect'] for r in selected),
                'adequateAnswers': sum(r['adequate'] for r in selected),
                'medians': {key: statistics.median(r[key] for r in measured) if measured else None
                    for key in ['calls', 'returnedCommandBytes', 'elapsedMs']},
                'usageMedians': {key: statistics.median(r['usage'][key] for r in measured) if measured else None
                    for key in ['input_tokens', 'cached_input_tokens', 'output_tokens']}}
        dump(evidence / 'summary.json', summary_result)
        dump(evidence / 'readback.json', {'sourceUnchanged': True, 'previousFrozenUnchanged': True,
            'toolEntriesAndBundleUnchanged': True, 'distinctThreads': len({r['threadIds'][0] for r in records if r['threadIds']})})
        print(json.dumps(summary_result), flush=True)
    finally:
        assert work.resolve().parent == Path(tempfile.gettempdir()).resolve() and work.name.startswith('repair-math # ')
        for junction in work.glob('*/node_modules'):
            if junction != work / 'dependencies/node_modules' and junction.exists():
                os.rmdir(junction)
        shutil.rmtree(work)
        dump(evidence / 'cleanup.json', {'temporaryRoot': str(work), 'removed': not work.exists()})


if __name__ == '__main__':
    main()
