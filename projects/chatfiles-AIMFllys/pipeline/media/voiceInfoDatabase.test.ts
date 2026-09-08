import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { readVoiceInfoEvidence } from './voiceInfoDatabase.js'

function canonicalFixture() {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE conversations(id TEXT PRIMARY KEY,username TEXT,owner TEXT);
    CREATE TABLE messages(
      message_uid TEXT,conv_id TEXT,source_snapshot TEXT,canonical_seq INTEGER,
      local_id INTEGER,server_id TEXT,occurred_at_epoch_s INTEGER,type INTEGER,
      structured_content_json TEXT
    );
    INSERT INTO conversations VALUES('conv-a','room@chatroom','owner-a');
    INSERT INTO messages VALUES
      ('uid-a','conv-a','snapshot-a',0,7,'9001',1700000000,34,'{"dataIndex":"0"}'),
      ('uid-b','conv-a','snapshot-a',1,8,'9002',1700000001,34,'{"dataIndex":"1"}');
  `)
  return database
}

function mediaFixture() {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE Name2Id(user_name TEXT);
    INSERT INTO Name2Id(rowid,user_name) VALUES(1,'room@chatroom'),(2,'unmapped@chatroom');
    CREATE TABLE VoiceInfo(
      chat_name_id INTEGER,create_time INTEGER,local_id INTEGER,svr_id INTEGER,
      voice_data BLOB,data_index TEXT
    );
    INSERT INTO VoiceInfo VALUES
      (1,1700000000,7,9001,x'02232153494c4b5f563366697874757265','0'),
      (1,1700000000,7,9002,x'02232153494c4b5f5633636f6e666c696374','0'),
      (2,1700000002,9,9003,x'02232153494c4b5f56336d697373696e67','0');
  `)
  return database
}

test('reads VoiceInfo as unique, conflict, and missing evidence without guessing', () => {
  const canonical = canonicalFixture()
  const media = mediaFixture()
  try {
    const records = readVoiceInfoEvidence({
      canonicalDb: canonical,
      mediaDb: media,
      sourceSnapshotId: 'snapshot-a',
      owner: 'owner-a',
      sourceDatabase: 'media_0.db',
    })
    assert.deepEqual(records.map((record) => ({
      rowId: record.sourceRowId,
      chat: record.evidence.chatUsername,
      dataIndex: record.evidence.dataIndex,
      status: record.alignment.status,
      messageUid: record.alignment.messageUid,
      candidates: record.alignment.candidateMessageUids,
    })), [
      {
        rowId: '1', chat: 'room@chatroom', dataIndex: '0', status: 'unique',
        messageUid: 'uid-a', candidates: ['uid-a'],
      },
      {
        rowId: '2', chat: 'room@chatroom', dataIndex: '0', status: 'conflict',
        messageUid: null, candidates: ['uid-a', 'uid-b'],
      },
      {
        rowId: '3', chat: 'unmapped@chatroom', dataIndex: '0', status: 'missing',
        messageUid: null, candidates: [],
      },
    ])
    assert.equal(records[0]?.sourceDatabase, 'media_0.db')
    assert.equal(records[0]?.payload.subarray(0, 10).toString('ascii'), '\u0002#!SILK_V3')
  } finally {
    canonical.close()
    media.close()
  }
})

test('fails visibly for an unknown VoiceInfo schema', () => {
  const canonical = canonicalFixture()
  const media = new DatabaseSync(':memory:')
  media.exec('CREATE TABLE VoiceInfo(chat_name_id INTEGER,voice_data BLOB)')
  try {
    assert.throws(() => readVoiceInfoEvidence({
      canonicalDb: canonical,
      mediaDb: media,
      sourceSnapshotId: 'snapshot-a',
      owner: 'owner-a',
      sourceDatabase: 'media_0.db',
    }), /VOICE_INFO_SCHEMA_UNSUPPORTED/u)
  } finally {
    canonical.close()
    media.close()
  }
})

test('rejects a VoiceInfo shard before loading blobs beyond the configured budget', () => {
  const canonical = canonicalFixture()
  const media = mediaFixture()
  try {
    assert.throws(() => readVoiceInfoEvidence({
      canonicalDb: canonical,mediaDb: media,sourceSnapshotId: 'snapshot-a',owner: 'owner-a',
      sourceDatabase: 'media_0.db',
      limits: { maxRows: 10,maxPayloadBytes: 8,maxTotalBytes: 64 },
    }), /VOICE_INFO_PAYLOAD_LIMIT_EXCEEDED/u)
  } finally {
    canonical.close()
    media.close()
  }
})

test('rejects invalid VoiceInfo budget configuration with a stable error code', () => {
  const canonical = canonicalFixture()
  const media = mediaFixture()
  try {
    assert.throws(() => readVoiceInfoEvidence({
      canonicalDb: canonical,mediaDb: media,sourceSnapshotId: 'snapshot-a',owner: 'owner-a',
      sourceDatabase: 'media_0.db',limits: { maxRows: 0 },
    }), /VOICE_INFO_LIMITS_INVALID/u)
  } finally {
    canonical.close()
    media.close()
  }
})
