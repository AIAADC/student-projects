import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  runConversationAssetBuilder,
} from './conversationAssetBuilder.js'
import { auditConversationAssetBundle } from './conversationAssetAudit.js'

function varint(value: number) {
  const bytes: number[] = []
  let remaining = value >>> 0
  do {
    const next = remaining & 0x7f
    remaining >>>= 7
    bytes.push(next | (remaining > 0 ? 0x80 : 0))
  } while (remaining > 0)
  return Buffer.from(bytes)
}

function bytesField(field: number, value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
}

function createWechatDatabase(filename: string, table: string) {
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE conversations(id TEXT PRIMARY KEY,owner TEXT NOT NULL,username TEXT NOT NULL);
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT, canonical_seq INTEGER, occurred_at_epoch_s INTEGER,
      source_snapshot TEXT, source_adapter TEXT, source_db TEXT, source_table TEXT, local_id INTEGER,
      server_id TEXT, time INTEGER, sender_name TEXT, raw_type INTEGER, type INTEGER,
      structured_content_json TEXT, text TEXT
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
      'canonical-fixture','complete','2026-07-12T12:00:00.000Z',2,'Asia/Shanghai',
      1,1,1,1,4,0,1,4,2,0
    );
    INSERT INTO bundle_metadata VALUES('run_id','canonical-fixture');
    INSERT INTO bundle_metadata VALUES('schema_version','2');
  `)
  db.prepare('INSERT INTO conversations VALUES (?, ?, ?)')
    .run('wx:owner:wxid_peer', 'owner', 'wxid_peer')
  db.prepare('INSERT INTO source_inventory VALUES (?,?,?,?,?,?,?,?,?)')
    .run('snapshot', 'regular', 'message_0.db', table, 4, 4, 0, 0, null)
  const insert = db.prepare(`INSERT INTO messages VALUES (${Array.from({ length: 16 }, () => '?').join(',')})`)
  insert.run(
    'wx:owner:wxid_peer', 'wxm:z-file', 0, 1_783_800_000, 'snapshot', 'regular',
    'message_0.db', table, 42, '9001', 1_783_800_000, '陈同学',
    25_769_803_825, 49, '{}', '课程讲义 https://example.com/lesson',
  )
  insert.run(
    'wx:owner:wxid_peer', 'wxm:a-link', 1, 1_783_800_000, 'snapshot', 'regular',
    'message_0.db', table, 45, '9004', 1_783_800_000, '陈同学',
    9_223_372_036_854_775_807n, 1, '{}', '补充链接 https://example.com/second',
  )
  insert.run(
    'wx:owner:wxid_peer', 'wxm:voice', 2, 1_783_800_001, 'snapshot', 'regular',
    'message_0.db', table, 43, '9002', 1_783_800_001, '陈同学', 34, 34, '{}', '',
  )
  insert.run(
    'wx:owner:wxid_peer', 'wxm:text', 3, 1_783_800_002, 'snapshot', 'regular',
    'message_0.db', table, 44, '9003', 1_783_800_002, '陈同学', 1, 1, '{}', '普通聊天文字',
  )
  db.close()
}
function createSourceDatabase(filename: string, table: string) {
  const db = new DatabaseSync(filename)
  db.exec(`CREATE TABLE "${table}"(
    local_id INTEGER, server_id INTEGER, local_type INTEGER, create_time INTEGER,
    origin_source INTEGER
  )`)
  const insert = db.prepare(`INSERT INTO "${table}" VALUES (?, ?, ?, ?, ?)`)
  insert.run(42, 9001, 25_769_803_825, 1_783_800_000, 1)
  insert.run(43, 9002, 34, 1_783_800_001, 1)
  db.close()
}

function createResourceDatabase(filename: string, hash: string, fileName: string) {
  const db = new DatabaseSync(filename)
  db.exec(`
    CREATE TABLE ChatName2Id(user_name TEXT PRIMARY KEY, update_time INTEGER);
    CREATE TABLE MessageResourceInfo(
      message_id INTEGER PRIMARY KEY, chat_id INTEGER, sender_id INTEGER,
      message_local_type INTEGER, message_create_time INTEGER, message_local_id INTEGER,
      message_svr_id INTEGER, message_origin_source INTEGER, packed_info BLOB
    );
    CREATE TABLE MessageResourceDetail(
      resource_id INTEGER PRIMARY KEY, message_id INTEGER, type INTEGER, size INTEGER,
      create_time INTEGER, access_time INTEGER, status INTEGER, data_index TEXT, packed_info BLOB
    );
  `)
  db.prepare('INSERT INTO ChatName2Id(rowid, user_name, update_time) VALUES (7, ?, 0)').run('wxid_peer')
  db.prepare('INSERT INTO MessageResourceInfo VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    100, 7, 1, 25_769_803_825, 1_783_800_000, 42, 9001, 1,
    bytesField(2, bytesField(1, hash)),
  )
  db.prepare('INSERT INTO MessageResourceDetail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    501, 100, 3_342_339, 4, 1_783_800_000, 1_783_800_000, 1, '0',
    bytesField(1, Buffer.concat([bytesField(1, fileName), bytesField(2, fileName)])),
  )
  db.prepare('INSERT INTO MessageResourceInfo VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    101, 7, 1, 25_769_803_825, 1_783_800_000, 42, 9001, 1, null,
  )
  db.prepare('INSERT INTO MessageResourceDetail VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    502, 101, 3_342_339, 4, 1_783_800_000, 1_783_800_000, 1, '1',
    bytesField(1, bytesField(1, '未确认.pdf')),
  )
  db.close()
}

test('builds a versioned resource, link, and voice asset bundle with exact counts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-assets-中文-'))
  const sourceRoot = path.join(root, 'snapshot')
  const sourceMessageRoot = path.join(sourceRoot, 'db_storage', 'message')
  const accountRoot = path.join(root, 'account')
  const fileRoot = path.join(accountRoot, 'msg', 'file', '2026-07')
  const bundleDir = path.join(root, 'data', 'chat-assets.next')
  fs.mkdirSync(sourceMessageRoot, { recursive: true })
  fs.mkdirSync(fileRoot, { recursive: true })

  const conversation = 'wxid_peer'
  const table = `Msg_${crypto.createHash('md5').update(conversation, 'utf8').digest('hex')}`
  const hash = '0123456789abcdef0123456789abcdef'
  const localName = `${hash}.pdf`
  const sourceDigest = `sha256:${crypto.createHash('sha256').update('PDF!').digest('hex')}`
  fs.writeFileSync(path.join(fileRoot, localName), Buffer.from('PDF!'))
  fs.writeFileSync(path.join(fileRoot, '未确认.pdf'), Buffer.from('NOPE'))

  const wechatDbPath = path.join(root, 'wechat.db')
  const resourceDbPath = path.join(root, 'message_resource.db')
  createWechatDatabase(wechatDbPath, table)
  createSourceDatabase(path.join(sourceMessageRoot, 'message_0.db'), table)
  createResourceDatabase(resourceDbPath, hash, '课程讲义.pdf')

  const unsupportedMediaPath = path.join(sourceMessageRoot, 'media_0.db')
  const unsupportedMedia = new DatabaseSync(unsupportedMediaPath)
  unsupportedMedia.exec('CREATE TABLE VoiceInfo(chat_name_id INTEGER,voice_data BLOB)'); unsupportedMedia.close()
  assert.throws(() => runConversationAssetBuilder({
    wechatDbPath,resourceDbPath,sourceSnapshotRoot: sourceRoot,accountRoot,bundleDir,runId: 'fixture-failed',
  }), /VOICE_INFO_SCHEMA_UNSUPPORTED/u)
  const failedStaging = path.join(path.dirname(bundleDir),
    `.${path.basename(bundleDir)}.fixture-failed.${process.pid}.staging`)
  assert.equal(fs.existsSync(failedStaging), false)
  fs.rmSync(unsupportedMediaPath)
  const result = runConversationAssetBuilder({
    wechatDbPath,resourceDbPath,sourceSnapshotRoot: sourceRoot,accountRoot,bundleDir,runId: 'fixture-run',
  })
  assert.deepEqual(result.counts, {
    all: 3,
    work: 0,
    document: 1,
    skill: 0,
    link: 2,
    chatText: 2,
  })
  const output = new DatabaseSync(path.join(bundleDir, 'artifacts.db'), { readOnly: true })
  try {
    const normalizedTables = output.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name LIKE 'asset_%'
      ORDER BY name
    `).all().map((row) => String(row.name))
    assert.deepEqual(normalizedTables, [
      'asset_associations',
      'asset_candidates',
      'asset_materializations',
      'asset_runs',
      'asset_sources',
      'assets',
    ])
    assert.equal(
      output.prepare("SELECT type FROM sqlite_master WHERE name='artifacts'").get()?.type,
      'view',
    )
    const rows = output.prepare(`
      SELECT kind, category, name, link_status, link_reason, materialization, preview_status, failure_reason
      FROM artifacts ORDER BY kind
    `).all().map((row) => ({ ...row }))
    assert.deepEqual(rows, [
      {
        kind: 'link', category: 'link', name: 'https://example.com/lesson',
        link_status: 'confirmed', link_reason: null,
        materialization: 'ready', preview_status: 'ready',
        failure_reason: null,
      },
      {
        kind: 'link', category: 'link', name: 'https://example.com/second',
        link_status: 'confirmed', link_reason: null,
        materialization: 'ready', preview_status: 'ready',
        failure_reason: null,
      },
      {
        kind: 'resource', category: 'document', name: '课程讲义.pdf',
        link_status: 'confirmed', link_reason: null,
        materialization: 'ready', preview_status: 'ready',
        failure_reason: null,
      },
    ])
    const linkOrder = output.prepare(`
      SELECT aa.message_uid
      FROM assets a JOIN asset_associations aa ON aa.association_id=a.association_id
      WHERE a.kind='link' ORDER BY a.canonical_seq,a.asset_id
    `)
      .all().map((row) => String(row.message_uid))
    assert.deepEqual(linkOrder, ['wxm:z-file', 'wxm:a-link'])
    assert.equal(output.prepare('SELECT count(*) AS count FROM asset_sources').get()?.count, 5)
    assert.equal(output.prepare('SELECT count(*) AS count FROM assets').get()?.count, 3)
    assert.equal(output.prepare('SELECT count(*) AS count FROM asset_associations WHERE quarantined=1').get()?.count, 2)
    assert.deepEqual({ ...output.prepare(`
      SELECT aa.association_status,aa.confirmation_status,aa.quarantined
      FROM asset_associations aa JOIN asset_sources s ON s.source_id=aa.source_id
      WHERE s.source_kind='voice'
    `).get() }, {
      association_status: 'missing', confirmation_status: 'unconfirmed', quarantined: 1,
    })
    assert.deepEqual({ ...output.prepare(`
      SELECT association_status,confirmation_status,reason
      FROM asset_associations a JOIN asset_sources s ON s.source_id=a.source_id
      WHERE s.resource_row_id='502'
    `).get() }, {
      association_status: 'exact',
      confirmation_status: 'unconfirmed',
      reason: 'filename_only',
    })
    assert.equal(output.prepare(`
      SELECT source_content_sha256 FROM asset_sources WHERE resource_row_id='501'
    `).get()?.source_content_sha256, sourceDigest)
    const run = output.prepare(`
      SELECT owner,source_snapshot_id,canonical_run_id,schema_version,
             canonical_database_sha256,resource_database_sha256,account_root_fingerprint
      FROM asset_runs
    `).get() as Record<string, unknown>
    assert.deepEqual({ owner: run.owner, snapshot: run.source_snapshot_id, canonicalRun: run.canonical_run_id }, {
      owner: 'owner', snapshot: 'snapshot', canonicalRun: 'canonical-fixture',
    })
    assert.equal(run.schema_version, 2)
    for (const key of ['canonical_database_sha256', 'resource_database_sha256', 'account_root_fingerprint']) {
      assert.match(String(run[key]), /^sha256:[a-f0-9]{64}$/u)
    }
    assert.equal(output.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
  } finally {
    output.close()
  }

  const index = JSON.parse(fs.readFileSync(path.join(bundleDir, 'index.json'), 'utf8'))
  assert.equal(index.version, 2)
  assert.equal(index.runId, 'fixture-run')
  assert.deepEqual(index.counts, result.counts)
  const audit = auditConversationAssetBundle({ bundleDir, accountRoot })
  assert.equal(audit.ok, true)
  assert.deepEqual(audit.issues, [])
  const missingDigest = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  missingDigest.prepare("UPDATE asset_sources SET source_content_sha256=NULL WHERE resource_row_id='501'").run()
  missingDigest.close()
  assert.equal(auditConversationAssetBundle({ bundleDir, accountRoot }).issues
    .some((issue) => issue.code === 'present-source-evidence-missing'), true)
  const restoreDigest = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  restoreDigest.prepare("UPDATE asset_sources SET source_content_sha256=? WHERE resource_row_id='501'").run(sourceDigest)
  restoreDigest.close()

  fs.writeFileSync(path.join(fileRoot, localName), Buffer.from('XXXX'))
  const replacedAudit = auditConversationAssetBundle({ bundleDir, accountRoot })
  assert.equal(replacedAudit.ok, false)
  assert.equal(
    replacedAudit.issues.some((issue) => issue.code === 'source-content-digest-mismatch'),
    true,
  )
  fs.writeFileSync(path.join(fileRoot, localName), Buffer.from('PDF!'))

  const tampered = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  tampered.prepare(`
    UPDATE asset_materializations SET failure_reason=NULL
    WHERE source_id IN (SELECT source_id FROM asset_sources WHERE source_kind='voice')
  `).run()
  tampered.close()
  const failedAudit = auditConversationAssetBundle({ bundleDir, accountRoot })
  assert.equal(failedAudit.ok, false)
  assert.equal(failedAudit.issues.some((issue) => issue.code === 'missing-failure-reason'), true)
  assert.throws(() => runConversationAssetBuilder({
    wechatDbPath,resourceDbPath,sourceSnapshotRoot: sourceRoot,accountRoot,bundleDir,runId: 'fixture-run-2',
  }), /already exists/u)
})
