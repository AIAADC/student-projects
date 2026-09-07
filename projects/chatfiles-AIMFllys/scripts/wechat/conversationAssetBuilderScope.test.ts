import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { runConversationAssetBuilder } from './conversationAssetBuilder.js'

type MessageFixture = {
  convId: string
  owner: string
  snapshot: string
  sourceDb: string
  uid: string
  sequence: number
  localId: number
  serverId: number
}

function tableFor(username: string) {
  return `Msg_${crypto.createHash('md5').update(username, 'utf8').digest('hex')}`
}

function createCanonicalDatabase(filename: string, username: string, messages: MessageFixture[]) {
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE conversations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,username TEXT NOT NULL);
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
      source_snapshot TEXT,source_adapter TEXT,source_db TEXT,source_table TEXT,local_id INTEGER,
      server_id TEXT,sender_name TEXT,raw_type INTEGER,type INTEGER,structured_content_json TEXT,text TEXT
    );
    CREATE TABLE source_inventory(
      source_snapshot TEXT,domain TEXT,source_db TEXT,source_table TEXT,
      discovered_rows INTEGER,parsed_rows INTEGER,deduplicated_rows INTEGER,
      excluded_rows INTEGER,exclusion_reason TEXT
    );
    CREATE TABLE parse_runs(
      run_id TEXT PRIMARY KEY,status TEXT,completed_at TEXT,schema_version INTEGER,time_zone TEXT,
      selected_snapshot_count INTEGER,selected_source_count INTEGER,source_unit_count INTEGER,
      source_conversation_count INTEGER,source_message_count INTEGER,excluded_source_row_count INTEGER,
      output_conversation_count INTEGER,output_message_count INTEGER,output_text_count INTEGER,
      deduplicated_message_count INTEGER
    );
    CREATE TABLE bundle_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    INSERT INTO parse_runs VALUES(
      'canonical-scope-fixture','complete','2026-07-12T12:00:00.000Z',2,'Asia/Shanghai',
      1,1,1,1,1,0,1,1,0,0
    );
    INSERT INTO bundle_metadata VALUES('run_id','canonical-scope-fixture');
    INSERT INTO bundle_metadata VALUES('schema_version','2');
  `)
  const conversations = new Set<string>()
  const insertConversation = db.prepare('INSERT INTO conversations VALUES(?,?,?)')
  const insertMessage = db.prepare(`INSERT INTO messages VALUES(${Array.from({ length: 15 }, () => '?').join(',')})`)
  const insertInventory = db.prepare('INSERT INTO source_inventory VALUES(?,?,?,?,?,?,?,?,?)')
  const table = tableFor(username)
  for (const message of messages) {
    if (!conversations.has(message.convId)) {
      insertConversation.run(message.convId, message.owner, username)
      conversations.add(message.convId)
    }
    const adapter = message.sourceDb.startsWith('biz_') ? 'biz' : 'regular'
    insertMessage.run(
      message.convId, message.uid, message.sequence, 1_783_800_000 + message.sequence,
      message.snapshot, adapter, message.sourceDb, table, message.localId,
      String(message.serverId), '成员', 49, 49, '{}', `[文件 ${message.uid}]`,
    )
    insertInventory.run(message.snapshot, adapter, message.sourceDb, table, 1, 1, 0, 0, null)
  }
  db.close()
}

function createSourceShard(filename: string, username: string, rows: MessageFixture[]) {
  const db = new DatabaseSync(filename)
  const table = tableFor(username)
  db.exec(`CREATE TABLE "${table}"(
    local_id INTEGER,server_id INTEGER,local_type INTEGER,create_time INTEGER,origin_source INTEGER
  )`)
  const insert = db.prepare(`INSERT INTO "${table}" VALUES(?,?,?,?,?)`)
  for (const row of rows) {
    insert.run(row.localId, row.serverId, 49, 1_783_800_000 + row.sequence, 1)
  }
  db.close()
}

function createResourceDatabase(filename: string, username: string, messages: MessageFixture[]) {
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE ChatName2Id(user_name TEXT PRIMARY KEY,update_time INTEGER);
    CREATE TABLE MessageResourceInfo(
      message_id INTEGER PRIMARY KEY,chat_id INTEGER,sender_id INTEGER,
      message_local_type INTEGER,message_create_time INTEGER,message_local_id INTEGER,
      message_svr_id INTEGER,message_origin_source INTEGER,packed_info BLOB
    );
    CREATE TABLE MessageResourceDetail(
      resource_id INTEGER PRIMARY KEY,message_id INTEGER,type INTEGER,size INTEGER,
      create_time INTEGER,access_time INTEGER,status INTEGER,data_index TEXT,packed_info BLOB
    );
    INSERT INTO ChatName2Id(rowid,user_name,update_time) VALUES(7,'${username}',0);
  `)
  const info = db.prepare('INSERT INTO MessageResourceInfo VALUES(?,?,?,?,?,?,?,?,?)')
  const detail = db.prepare('INSERT INTO MessageResourceDetail VALUES(?,?,?,?,?,?,?,?,?)')
  messages.forEach((message, index) => {
    const messageId = 100 + index
    info.run(
      messageId, 7, 1, 49, 1_783_800_000 + message.sequence,
      message.localId, message.serverId, 1, null,
    )
    detail.run(500 + index, messageId, 3_342_339, 4, 0, 0, 1, String(index), null)
  })
  db.close()
}

function buildFixture(root: string, snapshot: string, messages: MessageFixture[]) {
  const username = 'same_peer'
  const sourceRoot = path.join(root, snapshot)
  const shardRoot = path.join(sourceRoot, 'db_storage', 'message')
  const accountRoot = path.join(root, 'account')
  fs.mkdirSync(shardRoot, { recursive: true })
  fs.mkdirSync(accountRoot)
  const wechatDbPath = path.join(root, 'wechat.db')
  const resourceDbPath = path.join(shardRoot, 'message_resource.db')
  createCanonicalDatabase(wechatDbPath, username, messages)
  createResourceDatabase(resourceDbPath, username, messages.filter((message) => message.snapshot === snapshot))
  return {
    accountRoot,
    resourceDbPath,
    shardRoot,
    sourceSnapshotRoot: sourceRoot,
    username,
    wechatDbPath,
  }
}

test('opens arbitrary regular and biz shards used by canonical local/server evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-asset-shards-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const messages: MessageFixture[] = [
    { convId: 'conv-a', owner: 'owner-a', snapshot: 'snapshot-a', sourceDb: 'message_7.db', uid: 'uid-regular', sequence: 0, localId: 42, serverId: 9001 },
    { convId: 'conv-a', owner: 'owner-a', snapshot: 'snapshot-a', sourceDb: 'biz_message_3.db', uid: 'uid-biz', sequence: 1, localId: 43, serverId: 9002 },
  ]
  const fixture = buildFixture(root, 'snapshot-a', messages)
  createSourceShard(path.join(fixture.shardRoot, 'message_7.db'), fixture.username, [messages[0]!])
  createSourceShard(path.join(fixture.shardRoot, 'biz_message_3.db'), fixture.username, [messages[1]!])
  const bundleDir = path.join(root, 'assets.next')

  runConversationAssetBuilder({ ...fixture, bundleDir, runId: 'dynamic-shards' })

  const output = new DatabaseSync(path.join(bundleDir, 'artifacts.db'), { readOnly: true })
  assert.deepEqual(
    output.prepare(`
      SELECT a.message_uid
      FROM asset_associations a JOIN asset_sources s ON s.source_id=a.source_id
      WHERE s.source_kind='resource' ORDER BY a.message_uid
    `)
      .all().map((row) => String(row.message_uid)),
    ['uid-biz', 'uid-regular'],
  )
  output.close()
})

test('binds a resource username only inside the selected source snapshot owner scope', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-asset-owner-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const selected: MessageFixture = {
    convId: 'conv-owner-a', owner: 'owner-a', snapshot: 'snapshot-owner-a',
    sourceDb: 'message_0.db', uid: 'uid-owner-a', sequence: 0, localId: 42, serverId: 9001,
  }
  const other: MessageFixture = {
    convId: 'conv-owner-b', owner: 'owner-b', snapshot: 'snapshot-owner-b',
    sourceDb: 'message_0.db', uid: 'uid-owner-b', sequence: 1, localId: 42, serverId: 9001,
  }
  const fixture = buildFixture(root, selected.snapshot, [selected, other])
  createSourceShard(path.join(fixture.shardRoot, 'message_0.db'), fixture.username, [selected])
  const bundleDir = path.join(root, 'assets.next')

  runConversationAssetBuilder({ ...fixture, bundleDir, runId: 'owner-scope' })

  const output = new DatabaseSync(path.join(bundleDir, 'artifacts.db'), { readOnly: true })
  const row = output.prepare(`
    SELECT a.conv_id,a.message_uid
    FROM asset_associations a JOIN asset_sources s ON s.source_id=a.source_id
    WHERE s.source_kind='resource'
  `).get()
  assert.deepEqual({ ...row }, { conv_id: selected.convId, message_uid: selected.uid })
  assert.deepEqual({ ...output.prepare(`
    SELECT owner,source_snapshot_id,canonical_run_id FROM asset_runs
  `).get() }, {
    owner: selected.owner,
    source_snapshot_id: selected.snapshot,
    canonical_run_id: 'canonical-scope-fixture',
  })
  output.close()
})

test('never mixes canonical message evidence from another snapshot with reused coordinates', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-asset-snapshot-scope-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const selected: MessageFixture = {
    convId: 'conv-shared', owner: 'owner-a', snapshot: 'snapshot-selected',
    sourceDb: 'message_0.db', uid: 'uid-selected', sequence: 0, localId: 42, serverId: 9001,
  }
  const stale: MessageFixture = {
    ...selected,
    snapshot: 'snapshot-stale',
    uid: 'uid-stale',
    sequence: 1,
  }
  const fixture = buildFixture(root, selected.snapshot, [selected, stale])
  createSourceShard(path.join(fixture.shardRoot, 'message_0.db'), fixture.username, [selected])
  const bundleDir = path.join(root, 'assets.next')

  runConversationAssetBuilder({ ...fixture, bundleDir, runId: 'snapshot-scope' })

  const output = new DatabaseSync(path.join(bundleDir, 'artifacts.db'), { readOnly: true })
  try {
    assert.deepEqual({ ...output.prepare(`
      SELECT association_status,message_uid,candidate_count
      FROM asset_associations
    `).get() }, {
      association_status: 'exact',
      message_uid: selected.uid,
      candidate_count: 1,
    })
  } finally {
    output.close()
  }
})
