import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { operationCatalog } from '../../../shared/contracts/operations.js'
import { createToolRegistry, ToolExecutionError } from './toolRegistry.js'
import type { RankedSearchHit } from '../search/searchTypes.js'
import { stableMessageUid } from '../../wechat/legacyMessageIdentity.js'

function searchHit(id: string): RankedSearchHit {
  return {
    chunkId: `chunk-${id}`, conversationId: 'conv-a', firstMessageUid: id, lastMessageUid: id,
    firstSequence: 0, lastSequence: 0,
    startTime: 100, endTime: 101, senderIds: ['u-a'], text: `检索证据 ${id}`, ngrams: '',
    tokenCount: 5, rank: 1, score: 1, source: 'keyword',
  }
}

function fixture(t: test.TestContext) {
  const wechatDb = new DatabaseSync(':memory:')
  const artifactDb = new DatabaseSync(':memory:')
  wechatDb.exec(`
    CREATE TABLE conversations(id TEXT PRIMARY KEY,display TEXT,is_group INTEGER,msg_count INTEGER,text_count INTEGER,first_time INTEGER,last_time INTEGER);
    CREATE TABLE parse_runs(run_id TEXT,time_zone TEXT);
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT PRIMARY KEY,seq INTEGER,canonical_seq INTEGER,
      occurred_at_epoch_s INTEGER,time_precision TEXT,archive_day TEXT,time INTEGER,
      sender TEXT,person_id TEXT,sender_name TEXT,type INTEGER,type_label TEXT,text TEXT
    );
    INSERT INTO parse_runs VALUES('run-v2','Asia/Shanghai');
    INSERT INTO conversations VALUES('conv-a','中文会话',0,3,3,100,100);
    INSERT INTO messages VALUES
      ('conv-a','m-z',0,0,100,'second','1970-01-01',100,'u-a',NULL,'张三',1,'text','第一条'),
      ('conv-a','m-mid',1,1,100,'second','1970-01-01',100,'u-b',NULL,'李四',1,'text','目标消息'),
      ('conv-a','m-a',2,2,100,'second','1970-01-01',100,'u-a',NULL,'张三',1,'text','第三条');
  `)
  artifactDb.exec(`CREATE TABLE artifacts(
    asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,url TEXT,
    source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,materialization TEXT,preview_status TEXT
  )`)
  const assetId = 'a'.repeat(64)
  const linkId = 'b'.repeat(64)
  artifactDb.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(assetId, 'conv-a', 'document', 'resource', '中文说明.md', 'markdown', null, 10, 100, '张三', '说明摘要', 'exported', 'ready')
  artifactDb.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(linkId, 'conv-a', 'link', 'link', '示例链接', 'link', 'https://example.test', null, 101, '李四', '链接摘要', 'exported', 'ready')
  t.after(() => { wechatDb.close(); artifactDb.close() })
  const dependencies = {
    wechatDb,
    artifactDb,
    searchMessages: async () => ({ mode: 'keyword-only', reason: 'not_configured', hits: [searchHit('m-1'), searchHit('m-2'), searchHit('m-3')] }),
    readDocument: async (id, maxCharacters) => ({ assetId: id, title: '中文说明.md', text: '文档正文'.slice(0, maxCharacters), truncated: false, citation: `[文件:${id}]` }),
    resolveLinkPreview: async (id, url) => ({ status: 'ready', url, domain: 'example.test', title: '链接标题', description: '简介', siteName: '站点', iconUrl: '', updatedAt: '2026-07-13T00:00:00.000Z', assetId: id }),
  }
  const registry = createToolRegistry(dependencies)
  return { assetId, linkId, registry, dependencies }
}

function minimalLegacyFixture(t: test.TestContext) {
  const wechatDb = new DatabaseSync(':memory:')
  const artifactDb = new DatabaseSync(':memory:')
  wechatDb.exec(`
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY,display TEXT,is_group INTEGER,msg_count INTEGER,
      text_count INTEGER,first_time INTEGER,last_time INTEGER
    );
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
      type INTEGER,type_label TEXT,text TEXT
    );
    INSERT INTO conversations VALUES('legacy-conv','旧会话',0,5,5,100,100);
    INSERT INTO messages VALUES
      ('legacy-conv',NULL,0,100,'u-a','张三',1,'文本','旧消息一'),
      ('legacy-conv',NULL,1,100,'u-b','李四',1,'文本','旧消息二'),
      ('legacy-conv',NULL,2,100,'u-a','张三',1,'文本','旧消息三'),
      ('legacy-conv',NULL,3,100,'u-b','李四',1,'文本','旧消息四'),
      ('legacy-conv',NULL,4,100,'u-a','张三',1,'文本','旧消息五');
  `)
  artifactDb.exec(`CREATE TABLE artifacts(
    asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,url TEXT,
    source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,materialization TEXT,preview_status TEXT
  )`)
  t.after(() => { wechatDb.close(); artifactDb.close() })
  return createToolRegistry({
    wechatDb,
    artifactDb,
    searchMessages: async () => ({ mode: 'keyword-only', reason: 'not_configured', hits: [] }),
    readDocument: async () => { throw new Error('not used') },
    resolveLinkPreview: async () => { throw new Error('not used') },
  })
}

test('publishes exactly seven closed read-only JSON schemas', (t) => {
  const { registry } = fixture(t)
  assert.deepEqual(registry.schemas.map((schema) => schema.function.name), [
    'list_conversations', 'search_messages', 'get_message_context', 'search_artifacts',
    'read_document', 'get_timeline_slice', 'get_link_preview',
  ])
  assert.ok(registry.schemas.every((schema) => schema.function.parameters.additionalProperties === false))
})

test('rejects malformed and extra arguments with a stable error code', async (t) => {
  const { registry } = fixture(t)
  await assert.rejects(
    registry.execute('get_message_context', { messageUid: 'm-2', rawPath: 'private' }),
    (error: unknown) => error instanceof ToolExecutionError && error.code === 'invalid_arguments',
  )
  await assert.rejects(
    registry.execute('unknown_tool', {}),
    (error: unknown) => error instanceof ToolExecutionError && error.code === 'unknown_tool',
  )
})

test('runs chat-only tools without assets and reports asset tools as unavailable', async (t) => {
  const { dependencies } = fixture(t)
  const registry = createToolRegistry({
    wechatDb: dependencies.wechatDb,
    searchMessages: dependencies.searchMessages,
  })
  const result = await registry.execute('list_conversations', {}) as { conversations: unknown[] }
  assert.equal(result.conversations.length, 1)
  await assert.rejects(
    registry.execute('search_artifacts', {}),
    (error: unknown) => error instanceof ToolExecutionError && error.code === 'unavailable',
  )
})

test('uses canonical catalog defaults when the registry is called directly', async () => {
  let maximum = 0
  const assetId = 'a'.repeat(64)
  const registry = createToolRegistry({
    readDocument: async (id, maxCharacters) => {
      maximum = maxCharacters
      return { assetId: id, title: '说明.md', text: '正文', truncated: false, citation: `[文件:${id}]` }
    },
  })
  await registry.execute('read_document', { assetId })
  assert.equal(maximum, 12_000)
})

test('caps message search and returns stable message citations', async (t) => {
  const { registry } = fixture(t)
  const result = await registry.execute('search_messages', { query: '目标', limit: 2 }) as {
    hits: unknown[]; citations: string[]; mode: string
  }
  assert.equal(result.hits.length, 2)
  assert.deepEqual(result.citations, ['[消息:m-1]', '[消息:m-2]'])
  assert.equal(result.mode, 'keyword-only')
})

test('shares bounded conversation, context, artifact, document, timeline, and link services', async (t) => {
  const { assetId, linkId, registry } = fixture(t)
  const conversations = await registry.execute('list_conversations', { query: '中文', limit: 1 }) as { conversations: unknown[] }
  assert.equal(conversations.conversations.length, 1)
  const context = await registry.execute('get_message_context', { messageUid: 'm-mid', radius: 1 }) as {
    messages: Array<{ canonicalSequence?: number }>; citations: string[]
  }
  assert.equal(context.messages.length, 3)
  assert.deepEqual(context.citations, ['[消息:m-z]', '[消息:m-mid]', '[消息:m-a]'])
  assert.deepEqual(context.messages.map((message) => message.canonicalSequence), [0, 1, 2])
  const artifacts = await registry.execute('search_artifacts', { query: '说明', category: 'document', limit: 5 }) as { citations: string[] }
  assert.deepEqual(artifacts.citations, [`[文件:${assetId}]`])
  assert.equal((await registry.execute('read_document', { assetId }) as { citation: string }).citation, `[文件:${assetId}]`)
  const timeline = await registry.execute('get_timeline_slice', { conversationId: 'conv-a', aroundMessageUid: 'm-mid', limit: 3 }) as { messages: unknown[] }
  assert.equal(timeline.messages.length, 3)
  const link = await registry.execute('get_link_preview', { assetId: linkId }) as { citation: string; domain: string }
  assert.equal(link.citation, `[文件:${linkId}]`)
  assert.equal(link.domain, 'example.test')
  assert.doesNotMatch(JSON.stringify({ conversations, context, artifacts, timeline, link }), /rawPath|source_relative|private/u)
})

test('returns values accepted by every canonical operation output schema', async (t) => {
  const { assetId, linkId, registry } = fixture(t)
  const calls = [
    ['list_conversations', {}],
    ['search_messages', { query: '目标' }],
    ['search_artifacts', {}],
    ['read_document', { assetId }],
    ['get_message_context', { messageUid: 'm-mid' }],
    ['get_timeline_slice', { conversationId: 'conv-a' }],
    ['get_link_preview', { assetId: linkId }],
  ] as const
  for (const [name, input] of calls) {
    const result = await registry.execute(name, input)
    assert.equal(operationCatalog[name].outputSchema.safeParse(result).success, true, name)
  }
})

test('loads legacy message context through the same synthetic identity used by search', async (t) => {
  const registry = minimalLegacyFixture(t)
  const messageUids = Array.from({ length: 5 }, (_, sequence) => stableMessageUid({
    conv_id: 'legacy-conv', sequence, time: 100, legacy_rowid: sequence + 1,
  }, false))
  const targetUid = messageUids[2]!
  const context = await registry.execute('get_message_context', {
    messageUid: targetUid,
    radius: 2,
  }) as { messages: Array<{ messageUid: string; canonicalSequence?: number }>; citations: string[] }
  assert.equal(context.messages.length, 5)
  assert.equal(context.messages[2]?.messageUid, targetUid)
  assert.deepEqual(context.messages.map((message) => message.messageUid), messageUids)
  assert.deepEqual(context.messages.map((message) => message.canonicalSequence), [
    undefined, undefined, undefined, undefined, undefined,
  ])
  assert.equal(context.citations.every((citation) => citation.startsWith('[消息:legacy:')), true)
})
