// Explicit, disposable Windows feasibility experiment; never an installed Worker.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fsyncSync, lstatSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { createNativePlatform } from '../dist/platform.js';
import { readTerminationReceipt, startSupervision } from '../dist/execution-native.js';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts/worker-handoff-probe.mjs');
const platform = createNativePlatform(ROOT);
const env = { SystemRoot: process.env.SystemRoot };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = file => sha(readFileSync(file));
const DB_OPTIONS = { allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 25 };
const CASES = ['normal', 'before-handoff-loss', 'handoff-creator-crash', 'handoff-marker-crash', 'reply-loss', 'coordinator-crash'];
const NEGATIVE_CASE = 'graceful-stop-failure';
function atomic(file, value, raw = false) {
  assert.equal(existsSync(file), false, 'Fixture publication must not replace evidence.');
  const temporary = file + '.' + randomBytes(8).toString('hex') + '.part';
  const fd = openSync(temporary, 'wx');
  try { writeFileSync(fd, raw ? value : JSON.stringify(value) + '\n'); fsyncSync(fd); }
  finally { closeSync(fd); }
  renameSync(temporary, file);
}
function boundedJSON(file) {
  const stat = lstatSync(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0 && stat.size <= 16384);
  return JSON.parse(readFileSync(file, 'utf8'));
}
function config(dir) {
  platform.assertPrivateDirectory(dir);
  const file = join(dir, 'fixture.json'); platform.assertPrivateFile(file);
  const value = boundedJSON(file);
  assert.equal(value.kind, 'owned-inert-worker-preflight/v1');
  assert.ok(CASES.includes(value.mode) || value.mode === NEGATIVE_CASE);
  assert.equal(value.script, SCRIPT); assert.equal(value.node, process.execPath);
  assert.equal(value.scriptHash, digest(SCRIPT)); assert.equal(value.nodeHash, digest(process.execPath));
  assert.equal(digest(value.host), value.hostHash);
  return value;
}
function checked(exe, args, options = {}) {
  const result = spawnSync(exe, args, { env, shell: false, windowsHide: true, encoding: 'utf8', timeout: 15000, maxBuffer: 65536, ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout || 'Owned fixture command failed.');
  return result.stdout;
}
async function until(read, accept, label, timeout = 30000) {
  const deadline = performance.now() + timeout;
  do { const value = await read(); if (accept(value)) return value; await delay(20); } while (performance.now() < deadline);
  throw new Error('Bound exceeded: ' + label);
}
const waitFile = (dir, name) => until(() => existsSync(join(dir, name)), Boolean, name);
function guard(dir) {
  const db = new DatabaseSync(join(dir, 'guard.sqlite'), DB_OPTIONS);
  try { db.exec('BEGIN EXCLUSIVE'); return db; }
  catch (error) { db.close(); if (error.errcode === 5) return undefined; throw error; }
}
function release(db) { db.exec('ROLLBACK'); db.close(); }
function rows(dir) {
  const db = new DatabaseSync(join(dir, 'workflow.sqlite'), { ...DB_OPTIONS, readOnly: true });
  try { return { owner: db.prepare('SELECT epoch, actor FROM ownership').get(), events: db.prepare('SELECT role, kind, epoch FROM events ORDER BY seq').all(), startup: db.prepare('SELECT * FROM startup').get() }; }
  finally { db.close(); }
}
function event(db, role, kind, epoch) { db.prepare('INSERT INTO events(role,kind,epoch) VALUES(?,?,?)').run(role, kind, epoch); }
function selfTicks(c) { return JSON.parse(checked(c.host, ['--identity', String(process.pid)])).ticks; }
function request(dir) { return boundedJSON(join(dir, 'request.json')); }
function requestHash(dir) { return digest(join(dir, 'request.json')); }
function verifyReceipt(dir, kind) {
  const receipt = boundedJSON(join(dir, 'host-' + kind + '.json'));
  assert.equal(receipt.schemaVersion, 'angit-worker-host-probe/v1'); assert.equal(receipt.kind, kind);
  assert.equal(receipt.requestHash, requestHash(dir));
  for (const key of ['hostPid', 'coordinatorPid']) assert.ok(Number.isSafeInteger(receipt[key]) && receipt[key] > 0);
  for (const key of ['hostTicks', 'coordinatorTicks']) assert.match(receipt[key], /^[0-9]{15,20}$/u);
  const transcript = [receipt.schemaVersion, kind, receipt.hostPid, receipt.hostTicks, receipt.coordinatorPid, receipt.coordinatorTicks, receipt.exitCode, receipt.requestHash, ''].join('\n');
  const expected = createHmac('sha256', Buffer.from(request(dir).nonce, 'hex')).update(transcript).digest();
  const observed = Buffer.from(receipt.mac, 'hex');
  assert.equal(observed.length, expected.length); assert.ok(timingSafeEqual(observed, expected));
  return receipt;
}
async function absent(c, receipt) {
  await until(() => JSON.parse(checked(c.host, ['--absent', String(receipt.hostPid), receipt.hostTicks])).originalAbsent, Boolean, 'original Host exit');
  assert.equal(JSON.parse(checked(c.host, ['--absent', String(receipt.coordinatorPid), receipt.coordinatorTicks])).originalAbsent, true);
}
function control(dir, name, valid = true) {
  const req = request(dir), child = boundedJSON(join(dir, 'coordinator-start.json'));
  atomic(join(dir, name), (valid ? req.nonce : '0'.repeat(64)) + '|' + child.ticks + '|' + requestHash(dir), true);
}
function childRole(role, dir) {
  const child = spawn(process.execPath, [SCRIPT, role, dir], { env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', errors = '';
  for (const [stream, append] of [[child.stdout, text => { output += text; }], [child.stderr, text => { errors += text; }]]) {
    stream.setEncoding('utf8'); stream.on('data', text => { append(text); if (output.length + errors.length > 65536) child.kill(); });
  }
  const exited = new Promise((resolveExit, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolveExit({ code, signal, output, errors })); });
  return { child, exited };
}
async function launcher(dir) {
  const c = config(dir), held = guard(dir); assert.ok(held);
  let db = new DatabaseSync(join(dir, 'workflow.sqlite'), DB_OPTIONS);
  try {
    const req = { schemaVersion: 'angit-worker-handoff-fixture/v1', node: c.node, nodeHash: c.nodeHash, script: SCRIPT, scriptHash: c.scriptHash,
      mode: c.mode, nonce: randomBytes(32).toString('hex'), launcherPid: String(process.pid), launcherTicks: selfTicks(c) };
    atomic(join(dir, 'request.json'), req);
    db.exec('BEGIN IMMEDIATE');
    db.prepare("UPDATE ownership SET epoch=1, actor='launcher'").run();
    db.prepare("INSERT INTO startup(id,status,request_hash) VALUES('one-fixed-fixture-key','prepared',?)").run(requestHash(dir));
    event(db, 'launcher', 'prepared', 1); db.exec('COMMIT');
    const host = spawn(c.host, [dir, requestHash(dir)], { env, cwd: dir, detached: true, windowsHide: true, shell: false, stdio: 'ignore' });
    await new Promise((resolveStart, reject) => { host.once('spawn', resolveStart); host.once('error', reject); }); host.unref();
    await waitFile(dir, 'bootstrap.json');
    if (c.mode === 'before-handoff-loss') {
      atomic(join(dir, 'launcher-held.json'), { held: true });
      while (true) await delay(1000); // Keep the actual launcher alive until its retained owner terminates it.
    }
    const target = boundedJSON(join(dir, 'coordinator-start.json'));
    db.exec('BEGIN IMMEDIATE');
    db.prepare("UPDATE startup SET status='handed',worker_pid=?,worker_ticks=?").run(target.pid, target.ticks);
    event(db, 'launcher', 'handoff', 1); db.exec('COMMIT');
    if (c.mode === 'handoff-creator-crash') {
      atomic(join(dir, 'commit-cutpoint.json'), { committed: true });
      while (true) await delay(1000);
    }
    await waitFile(dir, 'blocked-before-release.json');
    if (c.mode === 'handoff-marker-crash') {
      atomic(join(dir, 'marker-cutpoint.json'), { committed: true, childBlocked: true });
      while (true) await delay(1000);
    }
    db.close(); db = undefined; release(held);
    atomic(join(dir, 'released.json'), { released: true });
    await waitFile(dir, 'host-ready.json'); verifyReceipt(dir, 'ready');
    if (c.mode !== 'reply-loss') console.log(JSON.stringify({ ready: true, epoch: 2 }));
  } finally { if (db) { db.close(); release(held); } }
}
function nativeSpec(dir) {
  const c = config(dir);
  return { executable: join(dir, 'inert.exe'), executableHash: c.inertHash, args: ['root-descendant', join(dir, 'observations')], cwd: dir,
    environment: env, input: '{"schemaVersion":"angit-fixture-task/v1","instructions":"inert preflight only"}',
    supervisorId: 'sup_worker_preflight', launchIdentity: sha(Buffer.from(request(dir).nonce, 'hex')),
    authority: { projectId: 'prj_worker_preflight', authorityIncarnation: 'a'.repeat(64), coordinatorEpoch: 2,
      resourceKey: 'task:tsk_inert_probe', fencingToken: 1, ownerId: 'owner_fixture' }, artifactDirectory: join(dir, 'native-proof'),
    budget: { timeoutMs: 15000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 1000, stopTimeoutMs: 2000 } };
}
async function coordinator(dir) {
  const c = config(dir), req = request(dir);
  atomic(join(dir, 'bootstrap.json'), { pid: process.pid });
  const committed = await until(() => {
    const state = rows(dir).startup;
    if (state?.status === 'handed') return state;
    if (existsSync(join(dir, 'creator-exited.json'))) {
      // Creator may have committed after our first snapshot and before its observed exit.
      const finalState = rows(dir).startup;
      return finalState?.status === 'handed' ? finalState : 'abandoned';
    }
    return undefined;
  }, Boolean, 'durable handoff or exact creator exit');
  if (committed === 'abandoned') return;
  assert.equal(committed.request_hash, requestHash(dir));
  assert.equal(committed.worker_pid, process.pid);
  assert.equal(committed.worker_ticks, selfTicks(c));
  if (c.mode === 'handoff-creator-crash') await waitFile(dir, 'creator-exited.json');
  atomic(join(dir, 'handoff.json'), { nonce: req.nonce, requestHash: requestHash(dir) });
  let held = guard(dir);
  if (!held) {
    atomic(join(dir, 'blocked-before-release.json'), { sqliteBusy: true });
    held = await until(() => guard(dir), Boolean, 'child guard acquisition');
  } else assert.equal(c.mode, 'handoff-creator-crash', 'Normal child must observe the parent guard.');
  let db, handle, pulse;
  try {
    db = new DatabaseSync(join(dir, 'workflow.sqlite'), DB_OPTIONS);
    db.exec('BEGIN IMMEDIATE');
    assert.equal(db.prepare('SELECT epoch FROM ownership').get().epoch, 1);
    assert.equal(db.prepare('SELECT status FROM startup').get().status, 'handed');
    db.prepare("UPDATE ownership SET epoch=2, actor='coordinator'").run(); event(db, 'coordinator', 'acquired', 2); db.exec('COMMIT');
    if (c.mode === 'coordinator-crash') {
      handle = await startSupervision(ROOT, nativeSpec(dir), { started(value) { atomic(join(dir, 'native-process.json'), value); } });
      pulse = setInterval(() => { void handle.pulse().catch(error => { console.error(error.code || error.name); }); }, 100);
      await handle.resume();
      await until(() => readdirSync(join(dir, 'observations')).filter(name => /^(?:root|child)-[0-9]+\.started$/u.test(name)), value => value.length === 2, 'inert root and descendant actually entered');
      atomic(join(dir, 'native-active.json'), { active: true });
    }
    db.exec('BEGIN IMMEDIATE'); db.prepare("UPDATE startup SET status='ready'").run(); event(db, 'coordinator', 'ready', 2); db.exec('COMMIT');
    atomic(join(dir, 'coordinator-ready.json'), { requestHash: requestHash(dir), nonceHash: sha(Buffer.from(req.nonce, 'hex')), epoch: 2, pid: process.pid });
    await waitFile(dir, 'coordinator-stop.json');
    assert.deepEqual(boundedJSON(join(dir, 'coordinator-stop.json')), { requestHash: requestHash(dir), nonce: req.nonce });
    if (c.mode === NEGATIVE_CASE) throw new Error('Intentional inert post-READY stop failure.');
    if (handle) { await handle.stop('op_preflight_cleanup'); await handle.completion; }
    event(db, 'coordinator', 'stopped', 2);
  } finally { clearInterval(pulse); db?.close(); release(held); }
}
async function observe(dir) {
  config(dir); const ready = verifyReceipt(dir, 'ready'), state = rows(dir);
  assert.equal(state.startup.id, 'one-fixed-fixture-key'); assert.equal(state.startup.status, 'ready');
  assert.equal(state.startup.request_hash, requestHash(dir)); assert.equal(state.startup.worker_pid, ready.coordinatorPid);
  assert.equal(state.startup.worker_ticks, ready.coordinatorTicks); assert.equal(state.owner.epoch, 2);
  console.log(JSON.stringify({ reusedLaunch: true, epoch: 2, pid: ready.coordinatorPid, requestHash: ready.requestHash }));
}
async function contender(dir) {
  config(dir); const held = guard(dir);
  if (held) release(held);
  console.log(JSON.stringify({ acquired: Boolean(held), epoch: rows(dir).owner.epoch }));
}
function protectedState() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'evidence/stage2-source-manifest.json'), 'utf8'));
  const items = Array.isArray(manifest.files) ? manifest.files : Object.values(manifest.files);
  const paths = items.map(item => typeof item === 'string' ? item : item.path).filter(path => /^(src|native|sql|schemas|contracts|bin|dist)\//u.test(path) || ['package.json', 'package-lock.json'].includes(path));
  assert.ok(paths.length > 40, 'Protect the actual Stage 2 source inventory.');
  return paths.map(path => ({ path, sha256: digest(join(ROOT, path)) }));
}
async function runner() {
  assert.equal(process.platform, 'win32'); assert.equal(process.arch, 'x64'); assert.equal(process.versions.node, '24.21.0');
  assert.ok(['--explicit-isolated-probe', '--explicit-isolated-stop-failure'].includes(process.argv[2]));
  const baseline = protectedState(), startedAt = new Date().toISOString();
  const base = mkdtempSync(join(tmpdir(), 'angit-worker-preflight-'));
  let allClosed = false; const results = [], owned = [];
  try {
    const powershell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
    checked(powershell, ['-NoProfile', '-NonInteractive', '-Command', "$p=$env:ANGIT_NEW_FIXTURE;$s=[Security.Principal.WindowsIdentity]::GetCurrent().User;$a=New-Object Security.AccessControl.DirectorySecurity;$a.SetOwner($s);$a.SetAccessRuleProtection($true,$false);$r=New-Object Security.AccessControl.FileSystemAccessRule($s,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);Set-Acl -LiteralPath $p -AclObject $a"], { env: { ...env, ANGIT_NEW_FIXTURE: base } });
    const baseIdentity = platform.identify(base);
    const privateRoot = platform.preparePrivateDirectory(join(base, 'owner-private')).canonicalPath;
    const privateIdentity = platform.assertPrivateDirectory(privateRoot);
    const framework = join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319'), host = join(privateRoot, 'worker-handoff-host.exe');
    checked(join(framework, 'csc.exe'), ['/noconfig', '/nologo', '/nostdlib+', '/target:exe', '/platform:x64', '/optimize+', '/debug-', '/main:WorkerHandoffHost', '/out:' + host,
      ...['mscorlib.dll', 'System.dll', 'System.Web.Extensions.dll'].map(name => '/reference:' + join(framework, name)), join(ROOT, 'native/Platform.cs'), join(ROOT, 'scripts/worker-handoff-host.cs')]);
    platform.assertPrivateFile(host);
    const identity = JSON.parse(readFileSync(join(ROOT, 'tests/.native/execution-fixture.identity.json'), 'utf8'));
    assert.equal(digest(join(ROOT, 'native/fixtures/ExecutionFixture.cs')), identity.sourceSha256);
    assert.equal(digest(join(ROOT, 'tests/.native/execution-fixture.exe')), identity.exeSha256);
    const common = { kind: 'owned-inert-worker-preflight/v1', node: process.execPath, nodeHash: digest(process.execPath), script: SCRIPT, scriptHash: digest(SCRIPT), host, hostHash: digest(host), inertHash: identity.exeSha256 };
    for (const mode of process.argv[2] === '--explicit-isolated-stop-failure' ? [NEGATIVE_CASE] : CASES) {
      const dir = platform.preparePrivateDirectory(join(privateRoot, mode)).canonicalPath, c = { ...common, mode };
      atomic(join(dir, 'fixture.json'), c);
      const db = new DatabaseSync(join(dir, 'workflow.sqlite'), DB_OPTIONS);
      db.exec('CREATE TABLE ownership(epoch INTEGER NOT NULL,actor TEXT NOT NULL); INSERT INTO ownership VALUES(0,\'none\'); CREATE TABLE events(seq INTEGER PRIMARY KEY,role TEXT NOT NULL,kind TEXT NOT NULL,epoch INTEGER NOT NULL); CREATE TABLE startup(id TEXT PRIMARY KEY,status TEXT NOT NULL,request_hash TEXT NOT NULL,worker_pid INTEGER,worker_ticks TEXT);'); db.close();
      new DatabaseSync(join(dir, 'guard.sqlite'), DB_OPTIONS).close();
      for (const name of ['observations', 'native-proof']) platform.preparePrivateDirectory(join(dir, name));
      copyFileSync(join(ROOT, 'tests/.native/execution-fixture.exe'), join(dir, 'inert.exe')); platform.assertPrivateFile(join(dir, 'inert.exe'));
      const launch = childRole('--launcher', dir); owned.push({ dir, c, launch });
      if (mode === 'before-handoff-loss') {
        await waitFile(dir, 'launcher-held.json'); assert.equal(launch.child.kill(), true);
        const exit = await launch.exited; assert.notEqual(exit.code, 0);
        await waitFile(dir, 'host-exit.json'); const receipt = verifyReceipt(dir, 'exit'); await absent(c, receipt);
        assert.equal(receipt.exitCode, 0);
        assert.equal(existsSync(join(dir, 'host-error.json')), false);
        assert.equal(existsSync(join(dir, 'coordinator-ready.json')), false);
        assert.equal(rows(dir).events.some(value => value.role === 'coordinator'), false);
        const free = guard(dir); assert.ok(free); release(free);
        results.push({ mode, passed: true, creatorTerminatedByRetainedHandle: true, bootstrapChildExitObserved: true, childWorkflowWrites: 0, readyPublished: false, epoch: rows(dir).owner.epoch });
        continue;
      }
      const creatorCrash = mode === 'handoff-creator-crash' || mode === 'handoff-marker-crash';
      if (creatorCrash) {
        await waitFile(dir, mode === 'handoff-creator-crash' ? 'commit-cutpoint.json' : 'marker-cutpoint.json');
        assert.equal(existsSync(join(dir, 'handoff.json')), mode === 'handoff-marker-crash');
        assert.equal(rows(dir).owner.epoch, 1);
        assert.equal(rows(dir).events.some(value => value.role === 'coordinator'), false);
        assert.equal(launch.child.kill(), true);
      }
      const exit = await launch.exited;
      if (creatorCrash) assert.notEqual(exit.code, 0);
      else { assert.equal(exit.code, 0, exit.errors); assert.equal(exit.signal, null); }
      await waitFile(dir, 'host-ready.json'); const ready = verifyReceipt(dir, 'ready');
      assert.equal(rows(dir).owner.epoch, 2);
      const firstContender = await childRole('--contender', dir).exited; assert.equal(firstContender.code, 0, firstContender.errors);
      assert.deepEqual(JSON.parse(firstContender.output), { acquired: false, epoch: 2 });
      assert.equal(rows(dir).events.filter(value => value.kind === 'acquired').length, 1);
      const outcome = { mode, passed: true, parentExitObserved: true, heldAfterParentExit: true, contenderBlocked: true,
        childBlockedBeforeRelease: existsSync(join(dir, 'blocked-before-release.json')), epoch: 2 };
      if (creatorCrash) {
        assert.equal(existsSync(join(dir, 'released.json')), false);
        outcome.creatorKilledAtCommittedHandoff = true; outcome.recoveredWithoutReleaseMarker = true;
      } else assert.equal(outcome.childBlockedBeforeRelease, true);
      if (mode === 'reply-loss' || creatorCrash) {
        assert.equal(exit.output, ''); const replay = await childRole('--observe', dir).exited; assert.equal(replay.code, 0, replay.errors);
        const observed = JSON.parse(replay.output); assert.equal(observed.reusedLaunch, true); assert.equal(observed.pid, ready.coordinatorPid);
        assert.equal(rows(dir).events.filter(value => value.kind === 'prepared').length, 1); outcome.sameKeyObserverReusedOneLaunch = true;
      }
      if (mode === 'normal') {
        for (const [index, name] of ['stop.token', 'stop.token', 'crash.token'].entries()) {
          control(dir, name, false); await waitFile(dir, 'rejected-control-' + (index + 1) + '.json');
          const stillHeld = await childRole('--contender', dir).exited;
          assert.equal(stillHeld.code, 0, stillHeld.errors); assert.equal(JSON.parse(stillHeld.output).acquired, false);
        }
        outcome.wrongTokenRejectedWithoutStop = true; outcome.repeatedInvalidControlsRejected = 3;
      }
      control(dir, mode === 'coordinator-crash' ? 'crash.token' : 'stop.token');
      await waitFile(dir, 'host-exit.json'); const receipt = verifyReceipt(dir, 'exit'); await absent(c, receipt);
      assert.equal(receipt.coordinatorPid, ready.coordinatorPid); assert.equal(receipt.coordinatorTicks, ready.coordinatorTicks);
      if (mode === 'coordinator-crash') {
        const receiptPath = join(dir, 'native-proof/termination.json'); await waitFile(dir, 'native-proof/termination.json');
        let lastFailure, retries = 0;
        const proof = await until(async () => {
          try { return await readTerminationReceipt(ROOT, receiptPath, nativeSpec(dir), boundedJSON(join(dir, 'native-process.json'))); }
          catch (error) { lastFailure = error; retries++; return undefined; }
        }, Boolean, 'complete authenticated receipt and absent supervisor; last=' + (lastFailure?.code || 'none'), 20000);
        outcome.nativeReadOnlyReconciliationRetries = retries;
        assert.equal(proof.writerTreeTerminated, true); assert.ok(['parent_eof', 'control_loss', 'heartbeat'].includes(proof.reason), proof.reason);
        const started = readdirSync(join(dir, 'observations')).filter(name => /^(?:root|child)-[0-9]+\.started$/u.test(name));
        assert.equal(started.length, 2); assert.ok(started.some(name => name.startsWith('child-')));
        assert.notEqual(receipt.exitCode, 0);
        outcome.nativeProof = { reason: proof.reason, writerTreeTerminated: proof.writerTreeTerminated, terminationReceiptHash: proof.terminationReceiptHash, realNativeReconciliation: true, actualProviderProcesses: 2 };
      }
      if (mode !== 'coordinator-crash') {
        assert.equal(receipt.exitCode, 0);
        assert.equal(rows(dir).events.filter(value => value.role === 'coordinator' && value.kind === 'stopped').length, 1);
      }
      assert.equal(existsSync(join(dir, 'host-error.json')), false);
      const free = guard(dir); assert.ok(free); release(free); outcome.guardReleasedAfterExactExit = true;
      results.push(outcome);
    }
    assert.deepEqual(protectedState(), baseline); allClosed = true;
    assert.deepEqual(platform.identify(base), baseIdentity);
    assert.deepEqual(platform.assertPrivateDirectory(privateRoot), privateIdentity);
    const report = { schemaVersion: 'angit-worker-preflight-evidence/v1', startedAt, finishedAt: new Date().toISOString(), platform: process.platform + '-' + process.arch,
      node: process.versions.node, sqlite: process.versions.sqlite, status: 'passed-isolated-preflight-not-production-worker', cases: results,
      protectedRuntimeFiles: baseline.length, protectedRuntimeUnchanged: true, scope: 'Synthetic SQLite handoff; inert retained-handle Host; real native attempt proof only. No production Core/schema/broker/Worker acceptance.',
      hashes: { scriptSha256: common.scriptHash, hostSourceSha256: digest(join(ROOT, 'scripts/worker-handoff-host.cs')), hostExeSha256: common.hostHash, platformSourceSha256: digest(join(ROOT, 'native/Platform.cs')), inertExeSha256: identity.exeSha256 },
      cleanup: 'all exact Host/Coordinator exits and native writer-tree proof observed; owned private fixture removed' };
    rmSync(base, { recursive: true }); console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    for (const { dir, launch } of owned) {
      if (launch.child.exitCode === null && launch.child.signalCode === null) launch.child.kill();
      if (existsSync(join(dir, 'coordinator-start.json')) && !existsSync(join(dir, 'stop.token')) && !existsSync(join(dir, 'host-exit.json'))) {
        try { control(dir, 'stop.token'); } catch (cleanupError) { console.error('Owned control cleanup unavailable: ' + cleanupError.name); }
      }
    }
    console.error(JSON.stringify({ status: 'failed', fixturePreserved: base, allClosed, completedCases: results, error: error.message }));
    throw error;
  }
}

const role = process.argv[2], dir = process.argv[3];
if (role === '--explicit-isolated-probe' || role === '--explicit-isolated-stop-failure') await runner();
else if (role === '--launcher') await launcher(dir);
else if (role === '--coordinator') await coordinator(dir);
else if (role === '--observe') await observe(dir);
else if (role === '--contender') await contender(dir);
else throw new Error('Explicit owned isolated probe invocation required.');
