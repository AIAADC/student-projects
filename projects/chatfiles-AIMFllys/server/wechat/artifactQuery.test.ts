import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { queryArtifacts } from './artifactQuery.js'

function fixtureDatabases() {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  assetDb.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY, conv_id TEXT, category TEXT, kind TEXT, name TEXT,
      preview TEXT, url TEXT, source_relative_path TEXT, source_size INTEGER,
      created_at INTEGER, sender_name TEXT, text TEXT, materialization TEXT,
      preview_status TEXT, failure_reason TEXT
    );
  `)
  wechatDb.exec(`
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT PRIMARY KEY, canonical_seq INTEGER,
      occurred_at_epoch_s INTEGER, time INTEGER, sender_name TEXT, type INTEGER, text TEXT
    );
  `)
  const insertAsset = assetDb.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  insertAsset.run('a'.repeat(64), 'conv-a', 'work', 'resource', '季度_计划%草案.pdf', 'pdf', null, 'private/季度.pdf', 20, 100, '张三', '内部说明', 'exported', 'ready', null)
  insertAsset.run('b'.repeat(64), 'conv-a', 'document', 'resource', '说明书.pdf', 'pdf', null, 'private/说明.pdf', 30, 100, '李四', '反斜杠 \\ 查询', 'decrypt_failed', 'decrypt_failed', 'secret detail')
  insertAsset.run('c'.repeat(64), 'conv-b', 'skill', 'resource', 'demo.ts', 'code', null, 'private/demo.ts', 40, 100, 'Alice', 'typescript', 'exported', 'ready', null)
  insertAsset.run('d'.repeat(64), 'conv-b', 'link', 'link', 'OpenAI', 'link', 'https://example.test/a_b%20', null, null, 90, 'Bob', '参考链接', 'exported', 'ready', null)
  insertAsset.run('e'.repeat(64), null, 'document', 'resource', '全局孤立文档.docx', 'docx', null, 'private/global.docx', 50, 80, '系统', '未关联会话', 'missing_source', 'missing_source', 'private failure')
  wechatDb.exec(`
    INSERT INTO messages VALUES ('conv-a', 'm-a', 0, 100, 100, '张三', 1, '中文消息 100%');
    INSERT INTO messages VALUES ('conv-a', 'm-2', 1, 100, 100, '李四', 49, '非文本消息');
    INSERT INTO messages VALUES ('conv-b', 'm-3', 0, 100, 100, 'Alice', 1, '下划线_a');
  `)
  return { assetDb, wechatDb }
}

test('reports exact six-tab global counts while all contains only the four artifact categories', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const page = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 60, offset: 0 })

  assert.deepEqual(page.counts, { all: 5, work: 1, document: 2, skill: 1, link: 1, chatText: 2 })
  assert.equal(page.total, 5)
  assert.equal(page.matchingTotal, 5)
  assert.equal(page.items.length, 5)
  assert.equal(page.items.every((item) => item.itemType === 'artifact'), true)
  assetDb.close()
  wechatDb.close()
})

test('defines library as ready exported artifacts and excludes chat text and failure states', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const all = queryArtifacts(assetDb, wechatDb, {
    collection: 'library', tab: 'all', query: '', limit: 60, offset: 0,
  })
  const text = queryArtifacts(assetDb, wechatDb, {
    collection: 'library', tab: 'chatText', query: '', limit: 60, offset: 0,
  })
  const failedSearch = queryArtifacts(assetDb, wechatDb, {
    collection: 'library', tab: 'all', query: '说明书', limit: 60, offset: 0,
  })

  assert.deepEqual(all.counts, { all: 3, work: 1, document: 0, skill: 1, link: 1, chatText: 0 })
  assert.deepEqual(all.items.map((item) => item.id), ['a'.repeat(64), 'c'.repeat(64), 'd'.repeat(64)])
  assert.equal(all.matchingTotal, 3)
  assert.equal(text.total, 0)
  assert.equal(text.matchingTotal, 0)
  assert.deepEqual(text.items, [])
  assert.equal(failedSearch.matchingTotal, 0)
  assetDb.close()
  wechatDb.close()
})

test('fails closed when a nominally ready artifact has an invalid evidence-state pair', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  assetDb.prepare('UPDATE artifacts SET materialization=?, preview_status=? WHERE asset_id=?')
    .run('missing_source', 'ready', 'a'.repeat(64))

  const page = queryArtifacts(assetDb, wechatDb, {
    collection: 'library', tab: 'all', query: '', limit: 60, offset: 0,
  })
  assert.deepEqual(page.items.map((item) => item.id), ['c'.repeat(64), 'd'.repeat(64)])
  assert.equal(page.counts.all, 2)
  assert.equal(page.matchingTotal, 2)
  assetDb.close()
  wechatDb.close()
})

test('scopes conversation artifacts and text while excluding null-conversation artifacts', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const page = queryArtifacts(assetDb, wechatDb, {
    conversationId: 'conv-a', tab: 'document', query: '', limit: 60, offset: 0,
  })
  const chatText = queryArtifacts(assetDb, wechatDb, {
    conversationId: 'conv-a', tab: 'chatText', query: '', limit: 60, offset: 0,
  })

  assert.deepEqual(page.counts, { all: 2, work: 1, document: 1, skill: 0, link: 0, chatText: 1 })
  assert.equal(page.total, 1)
  assert.equal(page.items[0]?.id, 'b'.repeat(64))
  assert.equal(chatText.total, 1)
  assert.equal(chatText.items[0]?.itemType, 'chatText')
  assert.equal(chatText.items[0] && 'content' in chatText.items[0] ? chatText.items[0].content : null, '中文消息 100%')
  assetDb.close()
  wechatDb.close()
})

test('searches Chinese asset fields and treats percent, underscore, and backslash literally', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const chinese = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '季度', limit: 60, offset: 0 })
  const percent = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '%', limit: 60, offset: 0 })
  const underscore = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '_', limit: 60, offset: 0 })
  const backslash = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '\\', limit: 60, offset: 0 })
  const textPercent = queryArtifacts(assetDb, wechatDb, { tab: 'chatText', query: '%', limit: 60, offset: 0 })

  assert.deepEqual(chinese.items.map((item) => item.id), ['a'.repeat(64)])
  assert.deepEqual(percent.items.map((item) => item.id).sort(), ['a'.repeat(64), 'd'.repeat(64)])
  assert.deepEqual(underscore.items.map((item) => item.id).sort(), ['a'.repeat(64), 'd'.repeat(64)])
  assert.deepEqual(backslash.items.map((item) => item.id), ['b'.repeat(64)])
  assert.equal(textPercent.matchingTotal, 1)
  assert.equal(percent.counts.all, 5)
  assert.equal(percent.total, 5)
  assetDb.close()
  wechatDb.close()
})

test('binds hostile search input without changing either database', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const page = queryArtifacts(assetDb, wechatDb, {
    tab: 'all', query: "x%' OR 1=1; DROP TABLE artifacts; --", limit: 60, offset: 0,
  })

  assert.equal(page.matchingTotal, 0)
  assert.equal(assetDb.prepare('SELECT count(*) AS count FROM artifacts').get()?.count, 5)
  assert.equal(wechatDb.prepare('SELECT count(*) AS count FROM messages').get()?.count, 3)
  assetDb.close()
  wechatDb.close()
})

test('uses a unique stable order for offset pagination at identical timestamps', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const first = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 2, offset: 0 })
  const second = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 2, offset: 2 })
  const repeated = queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 2, offset: 0 })

  assert.deepEqual(first.items.map((item) => item.id), repeated.items.map((item) => item.id))
  assert.equal(first.items.some((item) => second.items.some((other) => other.id === item.id)), false)
  assert.deepEqual([...first.items, ...second.items].map((item) => item.id), [
    'a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64), 'd'.repeat(64),
  ])
  assetDb.close()
  wechatDb.close()
})

test('orders canonical chat text by sequence instead of same-second message UID', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  wechatDb.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)')
    .run('conv-a', 'm-z', 2, 100, 100, '王五', 1, '同秒后续消息')

  const page = queryArtifacts(assetDb, wechatDb, {
    conversationId: 'conv-a', tab: 'chatText', query: '', limit: 60, offset: 0,
  })

  assert.deepEqual(page.items.map((item) => item.id), ['chat:m-z', 'chat:m-a'])
  assetDb.close()
  wechatDb.close()
})

test('returns only path-free public DTO fields and no ordinary artifact text', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  const page = queryArtifacts(assetDb, wechatDb, { tab: 'document', query: '', limit: 60, offset: 0 })
  const serialized = JSON.stringify(page)

  assert.doesNotMatch(serialized, /source_relative_path|candidate_message_uids|evidence_signature|failure_reason|private\//)
  assert.doesNotMatch(serialized, /内部说明|未关联会话|secret detail|private failure/)
  assert.deepEqual(Object.keys(page.items[0] ?? {}).sort(), [
    'association', 'availability', 'capability', 'category', 'conversationId', 'createdAt', 'id',
    'itemType', 'kind', 'materialization', 'metadataUrl', 'name', 'preview',
    'senderName', 'size', 'source', 'url',
  ])
  assert.equal(page.items[0]?.itemType === 'artifact' ? page.items[0].size : null, 30)
  assert.deepEqual(page.items[0]?.itemType === 'artifact' ? page.items[0].association : null, {
    status: 'legacy', evidence: 'legacy',
  })
  assert.deepEqual(page.items[0]?.itemType === 'artifact' ? page.items[0].source : null, {
    presence: 'present',
  })
  assert.deepEqual(page.items[0]?.itemType === 'artifact' ? page.items[0].materialization : null, {
    status: 'decrypt_failed',
  })
  assert.deepEqual(page.items[0]?.itemType === 'artifact' ? page.items[0].capability : null, {
    previewStatus: 'decrypt_failed',
  })
  assetDb.close()
  wechatDb.close()
})

test('filters every explicitly unconfirmed legacy artifact from ordinary queries', () => {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  try {
    assetDb.exec(`
      CREATE TABLE artifacts(
        asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
        url TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,
        materialization TEXT,preview_status TEXT,link_status TEXT,evidence_kind TEXT,
        alignment_status TEXT
      );
      INSERT INTO artifacts VALUES
        ('${'1'.repeat(64)}','conv','document','resource','确认.pdf','pdf',NULL,1,1,'成员','',
         'exported','ready','confirmed','resource_hash','exact'),
        ('${'2'.repeat(64)}','conv','document','resource','未确认.pdf','pdf',NULL,1,1,'成员','',
         'exported','ready','unconfirmed','filename_only','exact'),
        ('${'3'.repeat(64)}','conv','work','voice','未确认语音','voice',NULL,1,1,'成员','',
         'missing_source','missing_source','unconfirmed','message_type','exact'),
        ('${'4'.repeat(64)}','conv','link','link','未确认链接','link','https://example.test',NULL,1,'成员','',
         'exported','ready','unconfirmed','message_text','exact');
    `)
    wechatDb.exec('CREATE TABLE messages(conv_id TEXT,type INTEGER,text TEXT,sender_name TEXT)')

    const page = queryArtifacts(assetDb, wechatDb, {
      tab: 'all', query: '', limit: 10, offset: 0,
    })

    assert.deepEqual(page.items.map((item) => item.id), ['1'.repeat(64)])
    assert.equal(page.counts.all, 1)
  } finally {
    assetDb.close()
    wechatDb.close()
  }
})

test('returns zeroed counts and an empty page for empty databases', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  assetDb.exec('DELETE FROM artifacts')
  wechatDb.exec('DELETE FROM messages')

  assert.deepEqual(queryArtifacts(assetDb, wechatDb, { tab: 'all', query: '', limit: 60, offset: 0 }), {
    runId: 'legacy', timeZone: 'Asia/Shanghai',
    tab: 'all', counts: { all: 0, work: 0, document: 0, skill: 0, link: 0, chatText: 0 },
    total: 0, matchingTotal: 0, offset: 0, limit: 60, items: [],
  })
  assetDb.close()
  wechatDb.close()
})

test('fails closed when list rows contain an invalid evidence-state combination', () => {
  const { assetDb, wechatDb } = fixtureDatabases()
  assetDb.prepare('UPDATE artifacts SET materialization=?, preview_status=? WHERE asset_id=?')
    .run('missing_source', 'ready', 'a'.repeat(64))

  const page = queryArtifacts(assetDb, wechatDb, { tab: 'work', query: '', limit: 60, offset: 0 })
  assert.equal(page.items[0]?.itemType === 'artifact' ? page.items[0].availability : null, 'source_unavailable')
  assetDb.close()
  wechatDb.close()
})

test('lists chat text from the exact legacy schema without pretending its anchor is canonical', () => {
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  assetDb.exec(`CREATE TABLE artifacts(
    asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
    url TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,
    materialization TEXT,preview_status TEXT
  )`)
  wechatDb.exec(`CREATE TABLE messages(
    conv_id TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
    type INTEGER,type_label TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('legacy-conv',3,100,'member','成员',1,'text','旧版聊天素材');`)

  const first = queryArtifacts(assetDb, wechatDb, {
    tab: 'chatText', query: '旧版', limit: 10, offset: 0,
  })
  const repeated = queryArtifacts(assetDb, wechatDb, {
    tab: 'chatText', query: '旧版', limit: 10, offset: 0,
  })

  assert.equal(first.items[0]?.itemType, 'chatText')
  assert.match(first.items[0]?.id ?? '', /^chat:legacy:/u)
  assert.equal(repeated.items[0]?.id, first.items[0]?.id)
  assetDb.close()
  wechatDb.close()
})
