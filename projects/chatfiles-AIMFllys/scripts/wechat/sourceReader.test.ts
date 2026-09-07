import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { listMessageTables, loadMessageName2Id, readSourceMessages } from './sourceReader.js'

function createShard(sender: string, serverId: string, rawType = '244813135921') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-shard-'))
  const dbPath = path.join(dir, 'message.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE Name2Id(user_name TEXT PRIMARY KEY, is_session INTEGER);
    INSERT INTO Name2Id(rowid, user_name, is_session) VALUES (7, '${sender}', 0);
    CREATE TABLE Msg_fixture(
      local_id INTEGER, server_id INTEGER, local_type INTEGER, sort_seq INTEGER,
      real_sender_id INTEGER, create_time INTEGER, message_content TEXT, compress_content BLOB
    );
    INSERT INTO Msg_fixture VALUES (
      12, ${serverId}, ${rawType}, 99, 7, 1700000000, '中文正文', NULL
    );
  `)
  db.close()
  return {
    dbPath,
    cleanup() {
      fs.unlinkSync(dbPath)
      fs.rmdirSync(dir)
    },
  }
}

test('keeps Name2Id mappings isolated to their source message shard', () => {
  const left = createShard('wxid_left', '9007199254740999', '9223372032559808513')
  const right = createShard('wxid_right', '9007199254741001')
  try {
    const leftDb = new DatabaseSync(left.dbPath, { readOnly: true })
    const rightDb = new DatabaseSync(right.dbPath, { readOnly: true })
    try {
      assert.equal(loadMessageName2Id(leftDb).get(7), 'wxid_left')
      assert.equal(loadMessageName2Id(rightDb).get(7), 'wxid_right')
      assert.deepEqual([...listMessageTables(leftDb)], ['Msg_fixture'])

      const leftRows = readSourceMessages(leftDb, 'Msg_fixture')
      const rightRows = readSourceMessages(rightDb, 'Msg_fixture')
      assert.equal(leftRows[0].serverId, '9007199254740999')
      assert.equal(rightRows[0].serverId, '9007199254741001')
      assert.equal(leftRows[0].rawType, '9223372032559808513')
      assert.equal(leftRows[0].realSenderId, 7)
      assert.equal(leftRows[0].messageContent, '中文正文')
    } finally {
      leftDb.close()
      rightDb.close()
    }
  } finally {
    left.cleanup()
    right.cleanup()
  }
})
