import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildConversationVoiceArtifacts } from './conversationVoiceAdapter.js'
import type { AssetCanonicalMessage } from './conversationAssetModel.js'

function message(uid: string, localId: number, serverId: string): AssetCanonicalMessage {
  return {
    conv_id: 'conv-a', canonical_seq: localId, occurred_at_epoch_s: 1_700_000_000 + localId,
    source_snapshot: 'snapshot-a', source_adapter: 'regular', conversation_username: 'room@chatroom',
    sender_name: '成员甲', structured_content_json: '{}', text: '[语音]', message_uid: uid, source_db: 'message_0.db',
    chat_table: 'room@chatroom', message_table: 'Msg_fixture', local_id: localId,
    normalized_type: 34, raw_type: '34', create_time: 1_700_000_000 + localId,
    server_id: serverId, message_origin_source: 0,
  }
}

function canonicalDatabase(messages: readonly AssetCanonicalMessage[]) {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE conversations(id TEXT PRIMARY KEY,username TEXT,owner TEXT);
    CREATE TABLE messages(
      message_uid TEXT,conv_id TEXT,source_snapshot TEXT,canonical_seq INTEGER,
      local_id INTEGER,server_id TEXT,occurred_at_epoch_s INTEGER,type INTEGER,
      structured_content_json TEXT
    );
    INSERT INTO conversations VALUES('conv-a','room@chatroom','owner-a');
  `)
  const insert = database.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?)')
  for (const item of messages) {
    insert.run(
      item.message_uid,item.conv_id,item.source_snapshot,item.canonical_seq,item.local_id,
      item.server_id,item.occurred_at_epoch_s,34,'{}',
    )
  }
  return database
}

test('builds unique VoiceInfo media and quarantines an uncached voice placeholder', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-voice-adapter-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const messageDir = path.join(root, 'snapshot', 'db_storage', 'message')
  const stagingDir = path.join(root, 'bundle.staging')
  fs.mkdirSync(messageDir, { recursive: true })
  fs.mkdirSync(stagingDir)
  const media = new DatabaseSync(path.join(messageDir, 'media_0.db'))
  media.exec(`
    CREATE TABLE Name2Id(user_name TEXT);
    INSERT INTO Name2Id(rowid,user_name) VALUES(1,'room@chatroom');
    CREATE TABLE VoiceInfo(
      chat_name_id INTEGER,create_time INTEGER,local_id INTEGER,svr_id INTEGER,
      voice_data BLOB,data_index TEXT
    );
    INSERT INTO VoiceInfo VALUES(
      1,1700000007,7,9001,x'02232153494c4b5f563366697874757265','0'
    );
  `)
  media.close()
  const messages = [message('uid-a', 7, '9001'), message('uid-b', 8, '9002')]
  const canonical = canonicalDatabase(messages)
  t.after(() => canonical.close())

  const records = buildConversationVoiceArtifacts({
    canonicalDb: canonical,
    sourceSnapshotRoot: path.join(root, 'snapshot'),
    sourceSnapshotId: 'snapshot-a',
    owner: 'owner-a',
    stagingDir,
    messages,
  })

  assert.equal(records.length, 2)
  const exact = records.find((record) => record.message_uid === 'uid-a')
  assert.equal(exact?.materialization, 'ready')
  assert.equal(exact?.source_match_method, 'voice_info_unique')
  assert.match(exact?.materialized_relative_path ?? '', /^media\/[a-f0-9]{64}\.silk$/u)
  const placeholder = records.find((record) => record.message_uid === 'uid-b')
  assert.equal(placeholder?.asset_id, null)
  assert.equal(placeholder?.alignment_status, 'missing')
  assert.equal(placeholder?.confirmation_status, 'unconfirmed')
  assert.equal(placeholder?.materialization, 'source_missing')
  assert.equal(placeholder?.source_presence, 'missing')
})

test('fails closed when a discovered media shard has an unsupported VoiceInfo schema', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-voice-schema-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const messageDir = path.join(root, 'snapshot', 'db_storage', 'message')
  const stagingDir = path.join(root, 'bundle.staging')
  fs.mkdirSync(messageDir, { recursive: true })
  fs.mkdirSync(stagingDir)
  const media = new DatabaseSync(path.join(messageDir, 'media_0.db'))
  media.exec('CREATE TABLE VoiceInfo(chat_name_id INTEGER,voice_data BLOB)')
  media.close()
  const messages = [message('uid-a', 7, '9001')]
  const canonical = canonicalDatabase(messages)
  try {
    assert.throws(() => buildConversationVoiceArtifacts({
      canonicalDb: canonical,
      sourceSnapshotRoot: path.join(root, 'snapshot'),
      sourceSnapshotId: 'snapshot-a',
      owner: 'owner-a',
      stagingDir,
      messages,
    }), /VOICE_INFO_SCHEMA_UNSUPPORTED/u)
  } finally {
    canonical.close()
  }
})
