// Stage 0 only: independent disposable fixtures, no product APIs or callers.
// Static impact is bounded to this new file and its self-launched child/worker modes.
// No existing JS/TS project exists here; no empty dependency graph is claimed.
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';

const SCRIPT = fileURLToPath(import.meta.url);
const TARGET_NODE = 'v24.21.0';
const BUSY_MS = 200;
const CHILD_DEADLINE_MS = 30_000;
const WAIT_MS = 8_000;
const BASE_ROWS = 512;
const runtime = { node: process.version, execPath: process.execPath, platform: process.platform, arch: process.arch };
const errorData = (error) => ({ name: error.name, code: error.code ?? null, errcode: error.errcode ?? null, errstr: error.errstr ?? null, message: error.message });
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

function bounded(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function query(db, sql, ...parameters) {
  const statement = db.prepare(sql);
  // This executable owns prepared statements through their DatabaseSync connection.
  return statement.all(...parameters);
}

function value(db, pragma) {
  return Object.values(query(db, `PRAGMA ${pragma}`)[0])[0];
}

function settings(db) {
  return { foreignKeys: value(db, 'foreign_keys'), journalMode: value(db, 'journal_mode'), synchronous: value(db, 'synchronous'), busyTimeoutMs: value(db, 'busy_timeout') };
}

function configure(db, mode, timeout) {
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=${mode}; PRAGMA synchronous=FULL; PRAGMA busy_timeout=${timeout}; PRAGMA wal_autocheckpoint=0;`);
  return settings(db);
}

function failureFrom(action) {
  try { action(); return null; } catch (error) { return errorData(error); }
}

function isBusy(error) {
  // SQLite BUSY is primary code 5; retain the actual driver error as evidence.
  return error !== null && Number.isInteger(error.errcode) && (error.errcode & 255) === 5;
}

function rowEvidence(db) {
  const hash = createHash('sha256');
  const statement = db.prepare('SELECT id, payload FROM fixture_rows ORDER BY id');
  let count = 0;
  let bytes = 0;
  for (const row of statement.iterate()) {
    count += 1;
    bytes += Buffer.byteLength(row.payload);
    hash.update(JSON.stringify([row.id, row.payload]) + '\n');
  }
  return { count, payloadBytes: bytes, rowsSha256: hash.digest('hex') };
}

function send(message) {
  return bounded(new Promise((resolvePromise, reject) => {
    ensure(typeof process.send === 'function' && process.connected, 'Fixture child requires owned IPC');
    process.send(message, (error) => error ? reject(error) : resolvePromise());
  }), WAIT_MS, `Fixture child send ${message.type}`);
}

function messageQueue(emitter, event = 'message') {
  const queue = [];
  const waiters = [];
  let terminalError;
  const fail = (error) => {
    terminalError ??= error;
    for (const waiter of waiters.splice(0)) { clearTimeout(waiter.timer); waiter.reject(terminalError); }
  };
  emitter.on(event, (message) => {
    if (message?.type === 'fatal') { fail(new Error(JSON.stringify(message.error))); return; }
    const index = waiters.findIndex((waiter) => waiter.type === message?.type);
    if (index !== -1) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else if (queue.length < 64) queue.push(message);
    else fail(new Error('Fixture IPC queue bound exceeded'));
  });
  emitter.on('error', fail);
  return {
    fail,
    next(type, ms = WAIT_MS) {
      const index = queue.findIndex((message) => message?.type === type);
      if (index !== -1) return Promise.resolve(queue.splice(index, 1)[0]);
      if (terminalError) return Promise.reject(terminalError);
      return new Promise((resolvePromise, reject) => {
        const waiter = { type, resolve: resolvePromise, reject, timer: null };
        waiter.timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(new Error(`Fixture message ${type} exceeded ${ms} ms`));
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}

async function childMain(DatabaseSync, backup, role, root) {
  const inbox = messageQueue(process);
  let db;
  const watchdog = setTimeout(() => {
    // The parent owns this child and also enforces deadlines. Exit releases SQLite locks.
    process.exit(1);
  }, CHILD_DEADLINE_MS);
  const disconnected = () => process.exit(1);
  process.once('disconnect', disconnected);
  try {
    if (role === 'guard-holder' || role === 'wal-holder') {
      const guard = role === 'guard-holder';
      db = new DatabaseSync(join(root, guard ? 'guard.sqlite' : 'workflow.sqlite'), { timeout: 0, allowExtension: false });
      const effective = configure(db, guard ? 'DELETE' : 'WAL', 0);
      db.exec(guard ? 'BEGIN EXCLUSIVE' : 'BEGIN IMMEDIATE');
      await send({ type: 'held', pid: process.pid, effective, transaction: guard ? 'BEGIN EXCLUSIVE' : 'BEGIN IMMEDIATE' });
      await inbox.next('release');
      db.exec('ROLLBACK');
      await send({ type: 'released', pid: process.pid });
    } else if (role === 'guard-contender' || role === 'wal-contender') {
      const guard = role === 'guard-contender';
      db = new DatabaseSync(join(root, guard ? 'guard.sqlite' : 'workflow.sqlite'), { timeout: guard ? 0 : BUSY_MS, allowExtension: false });
      const effective = configure(db, guard ? 'DELETE' : 'WAL', guard ? 0 : BUSY_MS);
      await send({ type: 'ready', pid: process.pid, effective });
      for (let index = 0; index < 2; index += 1) {
        await inbox.next('attempt');
        const began = performance.now();
        const error = failureFrom(() => db.exec(guard ? 'BEGIN EXCLUSIVE' : 'BEGIN IMMEDIATE'));
        const elapsedMs = performance.now() - began;
        let readCount = null;
        if (!error) db.exec('ROLLBACK');
        if (!guard) readCount = query(db, 'SELECT count(*) AS count FROM fixture_rows')[0].count;
        await send({ type: 'attempt-result', index, pid: process.pid, admitted: error === null, elapsedMs, error, readCount });
      }
    } else if (role === 'backup-writer') {
      db = new DatabaseSync(join(root, 'workflow.sqlite'), { timeout: 2_000, allowExtension: false });
      const effective = configure(db, 'WAL', 2_000);
      await send({ type: 'ready', pid: process.pid, effective });
      await inbox.next('commit');
      const began = performance.now();
      db.exec("BEGIN IMMEDIATE; INSERT INTO fixture_rows(id,payload) VALUES(513,'committed-during-backup'); COMMIT;");
      // Owned marker is written only after the real independent SQLite commit returns.
      writeFileSync(join(root, 'backup-commit.marker'), JSON.stringify({ pid: process.pid, committedAt: Date.now() }), { flag: 'wx' });
      await send({ type: 'committed', pid: process.pid, elapsedMs: performance.now() - began, rowId: BASE_ROWS + 1 });
    } else if (role === 'backup-copy') {
      db = new DatabaseSync(join(root, 'workflow.sqlite'), { timeout: 2_000, allowExtension: false });
      configure(db, 'WAL', 2_000);
      const before = rowEvidence(db);
      let steps = 0;
      let firstProgress;
      let lastProgress;
      let barrier;
      const began = performance.now();
      const pages = await backup(db, join(root, 'backup.sqlite'), {
        rate: 16,
        progress(progress) {
          steps += 1;
          firstProgress ??= progress;
          lastProgress = progress;
          if (barrier || progress.remainingPages === 0) return;
          barrier = { remainingPages: progress.remainingPages, totalPages: progress.totalPages, waitMs: null };
          process.send({ type: 'backup-barrier', pid: process.pid, progress });
          const waitStarted = performance.now();
          const parker = new Int32Array(new SharedArrayBuffer(4));
          while (!existsSync(join(root, 'backup-commit.marker')) && performance.now() - waitStarted < 5_000) {
            Atomics.wait(parker, 0, 0, 10);
          }
          barrier.waitMs = performance.now() - waitStarted;
          ensure(existsSync(join(root, 'backup-commit.marker')), 'Independent writer did not commit during in-progress backup');
        },
      });
      await send({ type: 'backup-done', pid: process.pid, pages, steps, firstProgress, lastProgress, barrier: barrier ?? null, before, elapsedMs: performance.now() - began });
    } else throw new Error('Unsupported fixture child role');
  } finally {
    if (db?.isOpen) db.close();
    clearTimeout(watchdog);
    process.removeListener('disconnect', disconnected);
    process.disconnect();
  }
}

async function workerMain(DatabaseSync) {
  let db;
  try {
    ensure(workerData?.role === 'database-work', 'Unsupported fixture worker role');
    db = new DatabaseSync(join(workerData.root, 'worker.sqlite'), { allowExtension: false });
    const effective = configure(db, 'WAL', 0);
    parentPort.postMessage({ type: 'work-start', threadId: (await import('node:worker_threads')).threadId });
    const began = performance.now();
    db.exec('CREATE TABLE work(id INTEGER PRIMARY KEY) STRICT; BEGIN; WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<5000) INSERT INTO work SELECT x FROM n; COMMIT;');
    let passes = 0;
    let sum;
    while (performance.now() - began < 500 && passes < 100) {
      sum = query(db, 'WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<250000) SELECT sum(x) AS total FROM n')[0].total;
      passes += 1;
    }
    const evidence = { effective, passes, sum, rowCount: query(db, 'SELECT count(*) AS count FROM work')[0].count, integrity: query(db, 'PRAGMA integrity_check'), workElapsedMs: performance.now() - began };
    db.close();
    db = null;
    parentPort.postMessage({ type: 'work-done', evidence });
  } catch (error) {
    parentPort.postMessage({ type: 'fatal', error: errorData(error) });
    process.exitCode = 1;
  } finally {
    if (db?.isOpen) db.close();
    parentPort.close();
  }
}

async function parentMain(sqlite) {
  const report = {
    probe: 'sqlite-primitives', stage: 0, runtime, startedAt: new Date().toISOString(),
    productTests: 'NOT RUN',
    scope: 'New file only; self-launched disposable OS children and one dedicated DB worker; no exported product API or existing callers.',
    limits: [
      'Observed temporary local filesystem only; no network/sync filesystem, alias identity or product authority claim.',
      'FULL is an observed SQLite setting, not power-loss, storage-controller or cross-system durability proof.',
      'Backup covers one fixture database, not a complete Git/artifact backup set or restoration activation.',
      'The concurrent commit is scheduled between live backup steps, not claimed to overlap an individual page-copy instruction.',
      'Heartbeat is one bounded schedule, not a Coordinator load/latency SLA.',
      'node:sqlite remains a release-candidate API in this Node line; driver selection is not finalized by this probe.',
      'The reviewed executable does not expose StatementSync.close despite official latest-v24 documentation showing it; statements use connection-owned lifecycle and DatabaseSync.close.',
    ], checks: [],
  };
  const children = new Set();
  const workers = new Set();
  const databases = new Set();
  let root;
  const check = async (id, action, required = true) => {
    const result = { id, required, passed: false, evidence: {} };
    report.checks.push(result);
    const began = performance.now();
    try { await action(result.evidence); result.passed = true; } catch (error) { result.failure = errorData(error); }
    result.elapsedMs = performance.now() - began;
    return result;
  };
  const open = (path, options) => {
    const db = new sqlite.DatabaseSync(path, { allowExtension: false, ...options });
    databases.add(db);
    return db;
  };
  const launch = (role) => {
    const child = fork(SCRIPT, ['--fixture-child', role, root], {
      execPath: process.execPath, execArgv: [], shell: false, windowsHide: true,
      cwd: root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      // Do not inherit owner credentials or runtime-injection variables into fixture children.
      env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot ?? 'C:\\Windows' } : {},
    });
    children.add(child);
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-8192); });
    const inbox = messageQueue(child);
    const ended = new Promise((resolvePromise) => {
      child.once('exit', (code, signal) => {
        inbox.fail(new Error(`Fixture ${role} exited (${code}, ${signal}); ${stderr}`));
        resolvePromise({ code, signal });
      });
      child.once('error', () => resolvePromise({ code: null, signal: null, spawnFailed: true }));
    });
    const command = (type) => bounded(new Promise((resolvePromise, reject) => {
      child.send({ type }, (error) => error ? reject(error) : resolvePromise());
    }), WAIT_MS, `${role} send ${type}`);
    return { child, inbox, ended, command, async finish() {
      const exit = await bounded(ended, WAIT_MS, `${role} exit`);
      ensure(exit.code === 0 && exit.signal === null, `${role} failed to exit normally: ${JSON.stringify(exit)}`);
      return exit;
    } };
  };
  let workflow;
  try {
    root = mkdtempSync(join(tmpdir(), 'angit-stage0-sqlite-'));
    report.fixture = { name: basename(root), disposable: true };
    await check('runtime-and-driver', async (evidence) => {
      const db = open(':memory:');
      const version = query(db, 'SELECT sqlite_version() AS version, sqlite_source_id() AS sourceId')[0];
      evidence.sqlite = version;
      evidence.driver = { module: 'node:sqlite', databaseSync: typeof sqlite.DatabaseSync, backup: typeof sqlite.backup, databaseMethods: Object.getOwnPropertyNames(sqlite.DatabaseSync.prototype).sort(), statementMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(db.prepare('SELECT 1'))).sort(), statementLifecycle: 'connection-owned; released by DatabaseSync.close' };
      evidence.compileOptions = query(db, 'PRAGMA compile_options').map((row) => Object.values(row)[0]);
      ensure(typeof sqlite.backup === 'function', 'node:sqlite backup API is unavailable');
      db.close();
    });
    const prepared = await check('foreign-keys-strict-wal-full', async (evidence) => {
      workflow = open(join(root, 'workflow.sqlite'), { timeout: BUSY_MS });
      evidence.effective = configure(workflow, 'WAL', BUSY_MS);
      ensure(evidence.effective.foreignKeys === 1 && evidence.effective.journalMode === 'wal' && evidence.effective.synchronous === 2 && evidence.effective.busyTimeoutMs === BUSY_MS, 'Requested workflow PRAGMAs were not effective');
      workflow.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY) STRICT; CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER NOT NULL REFERENCES parent(id)) STRICT; CREATE TABLE fixture_rows(id INTEGER PRIMARY KEY,payload TEXT NOT NULL) STRICT; INSERT INTO parent VALUES(1); INSERT INTO child VALUES(1,1);');
      evidence.foreignKeyRejection = failureFrom(() => workflow.exec('INSERT INTO child VALUES(2,999)'));
      evidence.strictRejection = failureFrom(() => workflow.exec("INSERT INTO child VALUES(3,'not-an-integer')"));
      ensure((evidence.foreignKeyRejection?.errcode & 255) === 19 && (evidence.strictRejection?.errcode & 255) === 19, 'FK/STRICT violations did not produce SQLite constraint rejection');
      evidence.strictTables = query(workflow, 'PRAGMA table_list').filter((row) => ['parent', 'child', 'fixture_rows'].includes(row.name));
      ensure(evidence.strictTables.length === 3 && evidence.strictTables.every((row) => row.strict === 1), 'Fixture tables are not STRICT');
      const insert = workflow.prepare('INSERT INTO fixture_rows VALUES(?,?)');
      workflow.exec('BEGIN');
      try {
        for (let id = 1; id <= BASE_ROWS; id += 1) insert.run(id, `${id}:` + 'wal-fixture-'.repeat(750));
        workflow.exec('COMMIT');
      } catch (error) {
        evidence.insertionRollback = { attempted: true, failure: failureFrom(() => workflow.exec('ROLLBACK')) };
        throw error;
      }
      evidence.rows = rowEvidence(workflow);
      evidence.walBytes = statSync(join(root, 'workflow.sqlite-wal')).size;
      ensure(evidence.rows.count === BASE_ROWS && evidence.walBytes > 0, 'Committed WAL fixture was not populated');
      evidence.foreignKeyCheck = query(workflow, 'PRAGMA foreign_key_check');
      evidence.integrity = query(workflow, 'PRAGMA integrity_check');
      const guard = open(join(root, 'guard.sqlite'));
      evidence.guardEffective = configure(guard, 'DELETE', 0);
      guard.exec('CREATE TABLE guard_identity(id INTEGER PRIMARY KEY CHECK(id=1), project_identity TEXT NOT NULL) STRICT; INSERT INTO guard_identity VALUES(1,\'stage0-disposable\');');
      guard.close();
    });
    for (const kind of ['guard', 'wal']) {
      await check(kind === 'guard' ? 'cross-process-exclusive-lifetime-guard' : 'workflow-wal-bounded-busy', async (evidence) => {
        ensure(prepared.passed, 'Fixture preparation failed');
        const contender = launch(`${kind}-contender`);
        evidence.contender = await contender.inbox.next('ready');
        const holder = launch(`${kind}-holder`);
        evidence.holder = await holder.inbox.next('held');
        ensure(evidence.holder.pid !== evidence.contender.pid && evidence.holder.pid !== process.pid && evidence.contender.pid !== process.pid, 'Connections are not in two independent OS children');
        await contender.command('attempt');
        evidence.whileHeld = await contender.inbox.next('attempt-result');
        ensure(!evidence.whileHeld.admitted && isBusy(evidence.whileHeld.error), 'Contender was not rejected with SQLITE_BUSY while another process held the transaction');
        if (kind === 'guard') {
          ensure(evidence.holder.effective.journalMode === 'delete' && evidence.holder.effective.synchronous === 2 && evidence.contender.effective.busyTimeoutMs === 0, 'Guard is not rollback-journal FULL with immediate busy rejection');
        } else {
          ensure(evidence.contender.effective.journalMode === 'wal' && evidence.contender.effective.synchronous === 2 && evidence.contender.effective.busyTimeoutMs === BUSY_MS, 'WAL contender settings are ineffective');
          ensure(evidence.whileHeld.elapsedMs >= BUSY_MS * 0.75 && evidence.whileHeld.elapsedMs < 2_000, 'Busy wait was not observed within the bounded tolerance');
          ensure(evidence.whileHeld.readCount === BASE_ROWS, 'WAL read failed while another process held a write transaction');
        }
        await holder.command('release');
        evidence.release = await holder.inbox.next('released');
        evidence.holderExit = await holder.finish();
        await contender.command('attempt');
        evidence.afterRelease = await contender.inbox.next('attempt-result');
        ensure(evidence.afterRelease.admitted && evidence.afterRelease.error === null, 'Same contender failed admission after explicit holder rollback/release');
        evidence.contenderExit = await contender.finish();
      });
    }
    await check('online-backup-committed-wal-and-concurrent-write', async (evidence) => {
      ensure(prepared.passed && typeof sqlite.backup === 'function', 'WAL fixture/backup API prerequisite failed');
      evidence.before = rowEvidence(workflow);
      evidence.walBytesBefore = statSync(join(root, 'workflow.sqlite-wal')).size;
      const writer = launch('backup-writer');
      evidence.writer = await writer.inbox.next('ready');
      const copier = launch('backup-copy');
      evidence.inProgress = await copier.inbox.next('backup-barrier');
      ensure(evidence.inProgress.progress.remainingPages > 0, 'Backup already finished before the independent write');
      await writer.command('commit');
      evidence.commit = await writer.inbox.next('committed');
      evidence.copy = await copier.inbox.next('backup-done');
      evidence.writerExit = await writer.finish();
      evidence.copierExit = await copier.finish();
      ensure(evidence.writer.pid !== evidence.copy.pid && evidence.copy.barrier !== null, 'Concurrent backup/write was not executed in independent processes');
      const restored = open(join(root, 'backup.sqlite'), { readOnly: true });
      evidence.source = rowEvidence(workflow);
      evidence.backup = rowEvidence(restored);
      evidence.sourceIntegrity = query(workflow, 'PRAGMA integrity_check');
      evidence.backupIntegrity = query(restored, 'PRAGMA integrity_check');
      evidence.backupForeignKeys = query(restored, 'PRAGMA foreign_key_check');
      evidence.concurrentRow = query(restored, 'SELECT id,payload FROM fixture_rows WHERE id=513');
      evidence.backupFileBytes = statSync(join(root, 'backup.sqlite')).size;
      evidence.backupFileSha256 = createHash('sha256').update(readFileSync(join(root, 'backup.sqlite'))).digest('hex');
      evidence.schedule = 'First non-final backup progress callback pauses between steps until a separate OS process commits row 513; copying then resumes.';
      ensure(evidence.before.count === BASE_ROWS && evidence.source.count === BASE_ROWS + 1 && evidence.backup.count === BASE_ROWS + 1, 'Backup did not contain all initial committed WAL rows plus the mid-backup commit');
      ensure(evidence.source.rowsSha256 === evidence.backup.rowsSha256, 'Backup row-content hash differs from committed source');
      ensure(evidence.backupIntegrity.length === 1 && Object.values(evidence.backupIntegrity[0])[0] === 'ok' && evidence.sourceIntegrity.length === 1 && Object.values(evidence.sourceIntegrity[0])[0] === 'ok' && evidence.backupForeignKeys.length === 0, 'Backup/source integrity or FK check failed');
      restored.close();
    });
    await check('dedicated-db-worker-responsive-heartbeat', async (evidence) => {
      const worker = new Worker(new URL(import.meta.url), { workerData: { role: 'database-work', root }, execArgv: [], env: {}, stdout: true, stderr: true });
      workers.add(worker);
      worker.stdout.resume();
      worker.stderr.resume();
      const inbox = messageQueue(worker);
      const ended = new Promise((resolvePromise) => worker.once('exit', (code) => { inbox.fail(new Error(`Fixture worker exited (${code})`)); resolvePromise(code); }));
      evidence.started = await inbox.next('work-start');
      let beats = 0;
      let maxGapMs = 0;
      let last = performance.now();
      const heartbeat = setInterval(() => { const now = performance.now(); maxGapMs = Math.max(maxGapMs, now - last); last = now; beats += 1; }, 10);
      try {
        evidence.database = (await inbox.next('work-done')).evidence;
        maxGapMs = Math.max(maxGapMs, performance.now() - last);
      } finally { clearInterval(heartbeat); }
      evidence.heartbeat = { intervalMs: 10, beatsDuringSynchronousDbWork: beats, maxGapMs, allowedMaxGapMs: 250 };
      evidence.workerExitCode = await bounded(ended, WAIT_MS, 'DB worker exit');
      ensure(evidence.workerExitCode === 0 && evidence.database.rowCount === 5_000 && evidence.database.sum === 31_250_125_000, 'Dedicated worker DB result/exit was incorrect');
      ensure(evidence.database.workElapsedMs >= 500 && beats >= 5 && maxGapMs < 250, 'Main event-loop heartbeat was not responsive during dedicated synchronous DB work');
      ensure(evidence.database.integrity.length === 1 && Object.values(evidence.database.integrity[0])[0] === 'ok', 'Worker database integrity failed');
    });
  } catch (error) {
    report.checks.push({ id: 'fixture-orchestration', required: true, passed: false, failure: errorData(error) });
  } finally {
    await check('owned-fixture-cleanup', async (evidence) => {
      const failures = [];
      evidence.children = [];
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null && child.pid) {
          try {
            const exited = new Promise((resolvePromise) => child.once('exit', resolvePromise));
            child.kill('SIGKILL');
            await bounded(exited, 3_000, 'Owned child termination');
          } catch (error) { failures.push(errorData(error)); }
        }
        evidence.children.push({ pid: child.pid ?? null, exitCode: child.exitCode, signalCode: child.signalCode, stopped: child.exitCode !== null || child.signalCode !== null || !child.pid });
      }
      evidence.workers = [];
      for (const worker of workers) {
        try { if (worker.threadId !== -1) await bounded(worker.terminate(), 3_000, 'Owned worker termination'); } catch (error) { failures.push(errorData(error)); }
        evidence.workers.push({ stopped: worker.threadId === -1 });
      }
      for (const db of databases) {
        try { if (db.isOpen) db.close(); } catch (error) { failures.push(errorData(error)); }
      }
      evidence.allOwnedExecutorsStopped = evidence.children.every((child) => child.stopped) && evidence.workers.every((worker) => worker.stopped);
      if (root && evidence.allOwnedExecutorsStopped) {
        try { rmSync(root, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 }); } catch (error) { failures.push(errorData(error)); }
      }
      evidence.tempDirectoryRemoved = root ? !existsSync(root) : true;
      evidence.failures = failures;
      ensure(evidence.allOwnedExecutorsStopped && evidence.tempDirectoryRemoved && failures.length === 0, 'Owned fixture cleanup was incomplete; do not delete a directory with live executors');
    });
  }
  report.passed = report.checks.every((result) => !result.required || result.passed);
  report.finishedAt = new Date().toISOString();
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.passed ? 0 : 1;
}

async function entry() {
  if (process.version !== TARGET_NODE) {
    const error = { probe: 'sqlite-primitives', passed: false, runtime, requiredNode: TARGET_NODE, productTests: 'NOT RUN', checks: [{ id: 'supported-runtime', required: true, passed: false, failure: { code: 'UNSUPPORTED_NODE_RUNTIME', message: 'Use the reviewed Node 24.21.0 executable; Node 25 and all other patches are rejected before SQLite import or fixture creation.' } }] };
    if (isMainThread && !process.send) process.stdout.write(JSON.stringify(error, null, 2) + '\n');
    else if (parentPort) parentPort.postMessage({ type: 'fatal', error });
    process.exitCode = 1;
    return;
  }
  const sqlite = await import('node:sqlite');
  if (!isMainThread) { await workerMain(sqlite.DatabaseSync); return; }
  const args = process.argv.slice(2);
  if (args.length === 0 && !process.send) { await parentMain(sqlite); return; }
  const roles = new Set(['guard-holder', 'wal-holder', 'guard-contender', 'wal-contender', 'backup-writer', 'backup-copy']);
  ensure(args.length === 3 && args[0] === '--fixture-child' && roles.has(args[1]) && typeof process.send === 'function', 'Only the no-argument probe or fixed owned fixture-child mode is supported');
  const root = resolve(args[2]);
  ensure(root === resolve(process.cwd()) && dirname(root) === resolve(tmpdir()) && basename(root).startsWith('angit-stage0-sqlite-'), 'Child mode must use the parent-owned disposable temp fixture');
  await childMain(sqlite.DatabaseSync, sqlite.backup, args[1], root);
}

try { await entry(); } catch (error) {
  if (parentPort) parentPort.postMessage({ type: 'fatal', error: errorData(error) });
  else if (process.connected) { try { await send({ type: 'fatal', error: errorData(error) }); } catch {} process.disconnect(); }
  else process.stdout.write(JSON.stringify({ probe: 'sqlite-primitives', passed: false, runtime, failure: errorData(error), productTests: 'NOT RUN' }) + '\n');
  process.exitCode = 1;
}
