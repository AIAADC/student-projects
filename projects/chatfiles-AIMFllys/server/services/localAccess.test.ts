import assert from 'node:assert/strict'
import test from 'node:test'
import { createLocalAccessService, LocalAccessError } from './localAccess.js'

test('maps six public operations to bounded shared read-only tools', async () => {
  const calls: Array<{ name: string; input: unknown }> = []
  const service = createLocalAccessService({
    status: async () => ({ name: '午夜书斋本地只读接口', wechat: 'ready', artifacts: 'ready' }),
    execute: async (name, input) => {
      calls.push({ name, input })
      return { result: '中文结果', citation: '[消息:m-1]' }
    },
  })

  assert.equal((await service.status()).name, '午夜书斋本地只读接口')
  await service.conversations({ query: '中文', limit: 100 })
  await service.search({ query: '目标', conversationId: 'conv-a', limit: 1 })
  await service.artifacts({ query: '文档', category: 'document', limit: 20 })
  await service.readDocument({ assetId: 'a'.repeat(64), maxCharacters: 50_000 })
  await service.messageContext({ messageUid: 'm-1', radius: 20 })

  assert.deepEqual(calls.map((call) => call.name), [
    'list_conversations', 'search_messages', 'search_artifacts', 'read_document', 'get_message_context',
  ])
  assert.equal((calls[0].input as { limit: number }).limit, 100)
  assert.equal((calls[1].input as { limit: number }).limit, 1)
  assert.equal((calls[3].input as { maxCharacters: number }).maxCharacters, 50_000)
  assert.equal((calls[4].input as { radius: number }).radius, 20)
})

test('rejects rather than clamps invalid numeric limits', async () => {
  let calls = 0
  const service = createLocalAccessService({
    status: async () => ({ name: '本地', wechat: 'ready', artifacts: 'ready' }),
    execute: async () => { calls += 1; return {} },
  })
  const attempts = [
    () => service.conversations({ limit: 0 }),
    () => service.search({ query: '目标', limit: Number.NaN }),
    () => service.artifacts({ limit: Number.POSITIVE_INFINITY }),
    () => service.readDocument({ assetId: 'a'.repeat(64), maxCharacters: 1.5 }),
    () => service.messageContext({ messageUid: 'm-1', radius: 21 }),
  ]
  for (const attempt of attempts) {
    await assert.rejects(attempt(), (error: unknown) => (
      error instanceof LocalAccessError && error.code === 'invalid_input'
    ))
  }
  assert.equal(calls, 0)
})

test('rejects invalid identifiers, categories, and overlong Unicode without invoking tools', async () => {
  let calls = 0
  const service = createLocalAccessService({
    status: async () => ({ name: '本地', wechat: 'ready', artifacts: 'ready' }),
    execute: async () => { calls += 1; return {} },
  })
  await assert.rejects(service.search({ query: '🙂'.repeat(501) }), (error: unknown) => (
    error instanceof LocalAccessError && error.code === 'invalid_input'
  ))
  await assert.rejects(service.artifacts({ category: 'private' as 'all' }), /invalid_input/u)
  await assert.rejects(service.readDocument({ assetId: '..\\private' }), /invalid_input/u)
  assert.equal(calls, 0)
})

test('returns only the backend public result and never wraps paths or keys', async () => {
  const service = createLocalAccessService({
    status: async () => ({ name: '本地', wechat: 'ready', artifacts: 'ready' }),
    execute: async () => ({ hits: [{ text: '结果', citation: '[消息:m-1]' }] }),
  })
  const serialized = JSON.stringify(await service.search({ query: '结果' }))
  assert.doesNotMatch(serialized, /sourcePath|databasePath|apiKey|[A-Z]:\\/u)
})
