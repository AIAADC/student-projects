import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { queryArtifacts } from './artifactQuery.js'
import { stableMessageUid } from './legacyMessageIdentity.js'

test('lists nullable legacy message identities in descending sequence order', () => {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  try {
    assetDb.exec(`CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
      url TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,
      materialization TEXT,preview_status TEXT
    )`)
    wechatDb.exec(`CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
      type INTEGER,type_label TEXT,text TEXT
    ); INSERT INTO messages VALUES
      ('legacy-conv',NULL,2,100,'member','成员',1,'text','旧版聊天素材'),
      ('legacy-conv',NULL,0,100,'member','成员',1,'text','旧版聊天素材'),
      ('legacy-conv',NULL,1,100,'member','成员',1,'text','旧版聊天素材');`)
    const page = queryArtifacts(assetDb, wechatDb, {
      tab: 'chatText', query: '旧版', limit: 10, offset: 0,
    })
    const expected = [
      stableMessageUid({ conv_id: 'legacy-conv', sequence: 2, time: 100, legacy_rowid: 1 }, true),
      stableMessageUid({ conv_id: 'legacy-conv', sequence: 1, time: 100, legacy_rowid: 3 }, true),
      stableMessageUid({ conv_id: 'legacy-conv', sequence: 0, time: 100, legacy_rowid: 2 }, true),
    ]
    assert.deepEqual(page.items.map((item) => item.itemType === 'chatText' ? item.messageUid : ''), expected)
  } finally {
    assetDb.close()
    wechatDb.close()
  }
})
