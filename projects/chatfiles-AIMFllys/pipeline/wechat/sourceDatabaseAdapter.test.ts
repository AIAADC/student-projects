import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { closeSnapshotSources, openSnapshotSources } from './sourceDatabaseAdapter.js'

test('accounts for real message tables when Name2Id is missing instead of collapsing inventory to zero', (t) => {
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-source-adapter-'))
  t.after(() => fs.rmSync(snapshot, { force: true, recursive: true }))
  const messageDir = path.join(snapshot, 'db_storage', 'message')
  fs.mkdirSync(messageDir, { recursive: true })
  const sourcePath = path.join(messageDir, 'message_0.db')
  const db = new DatabaseSync(sourcePath)
  db.exec(`
    CREATE TABLE Msg_fixture(
      local_id INTEGER, server_id INTEGER, local_type INTEGER, sort_seq INTEGER,
      real_sender_id INTEGER, create_time INTEGER, message_content TEXT
    );
    INSERT INTO Msg_fixture VALUES(1, 2, 1, 3, 4, 5, '中文消息');
  `)
  db.close()

  const opened = openSnapshotSources(snapshot)
  t.after(() => closeSnapshotSources(opened.messageSources))

  assert.deepEqual(opened.inventory, [{
    domain: 'regular',
    sourceDb: 'message_0.db',
    sourceTable: 'Msg_fixture',
    discoveredRows: 1,
    parsedRows: 0,
    deduplicatedRows: 0,
    excludedRows: 1,
    exclusionReason: 'missing_name2id_mapping',
  }])
  assert.equal(opened.messageSources.length, 0)
})
