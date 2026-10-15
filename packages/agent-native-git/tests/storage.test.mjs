import test from 'node:test';
import assert from 'node:assert/strict';
import { renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fixture } from './stage1-fixture.mjs';

test('missing and future-version workflow storage is preserved, never recreated or downgraded by reads', async () => {
  const f = fixture();
  try {
    const initialized = await f.command(f.initArgs);
    assert.equal(initialized.exit, 0, initialized.output + initialized.errors);
    const file = join(f.stateRoot, 'projects', initialized.result.data.projectId, 'state.sqlite');
    const displaced = file + '.owner-preserved';
    renameSync(file, displaced);
    const missing = await f.command(['status', '--json']);
    assert.notEqual(missing.exit, 0); assert.equal(missing.result.ok, false);
    assert.equal(existsSync(file), false); assert.equal(existsSync(displaced), true);
    renameSync(displaced, file);
    const db = new DatabaseSync(file);
    const epoch = db.prepare('SELECT coordinator_epoch FROM projects').get().coordinator_epoch;
    db.exec('PRAGMA user_version=99'); db.close();
    const future = await f.command(['doctor', '--json']);
    assert.equal(future.result.error.code, 'SCHEMA_UNSUPPORTED');
    const observed = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(observed.prepare('PRAGMA user_version').get().user_version, 99);
      assert.equal(observed.prepare('SELECT coordinator_epoch FROM projects').get().coordinator_epoch, epoch);
      assert.equal(observed.prepare('SELECT count(*) AS count FROM tasks').get().count, 0);
    } finally { observed.close(); }
  } finally { f.cleanup(); }
});
