import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentStreamRequest } from '../../shared/contracts/aiAgent.js'
import { withServer } from './wechatRouteTestFixtures.js'
import { createAiAgentRouter } from './aiAgent.js'

function requestBody(): AgentStreamRequest {
  return {
    question: '请查找中文证据', conversationId: 'conv-a', conversationName: '测试会话', history: [],
    config: {
      baseURL: 'https://example.test/v1', apiKey: 'fake-private-key', model: 'fixture-model',
      temperature: 0.2, contextWindow: 128_000, contextStrategy: 'recent',
      embedding: { enabled: false, baseURL: 'https://example.test/v1', apiKey: '', model: 'fixture-vector', dimensions: 3, batchSize: 4 },
    },
  }
}

function frames(value: string) {
  return value.split('\n\n').flatMap((frame) => {
    const data = frame.split('\n').find((line) => line.startsWith('data: '))?.slice(6)
    return data ? [JSON.parse(data) as Record<string, unknown>] : []
  })
}

test('streams only allowlisted UTF-8 agent events without exposing keys', async () => {
  const router = createAiAgentRouter({
    execute: async (_request, emit) => {
      emit({ type: 'step', step: 1, label: '检索中文' })
      emit({ type: 'tool', step: 1, name: 'search_messages', status: 'complete' })
      emit({ type: 'citation', citation: '[消息:m-1]', kind: 'message', id: 'm-1' })
      emit({ type: 'delta', content: '中文回答' })
      emit({ type: 'done', mode: 'agent', strategy: 'recent', evidenceCount: 1, steps: 1 })
    },
  })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody()),
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/u)
    const text = await response.text()
    assert.doesNotMatch(text, /fake-private-key/u)
    assert.deepEqual(frames(text).map((event) => event.type), ['step', 'tool', 'citation', 'delta', 'done'])
    assert.match(text, /中文回答/u)
  })
})

test('rejects malformed configuration before opening an event stream', async () => {
  const router = createAiAgentRouter({ execute: async () => { throw new Error('should not run') } })
  await withServer(router, async (baseUrl) => {
    const body = requestBody() as unknown as Record<string, unknown>
    body.question = ''
    const response = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'invalid_agent_request' })
  })
})

test('rejects malformed persisted summaries before invoking the agent', async () => {
  const router = createAiAgentRouter({ execute: async () => { throw new Error('should not run') } })
  await withServer(router, async (baseUrl) => {
    const body = requestBody() as AgentStreamRequest & { summary?: unknown }
    body.summary = { version: 1, sourceHash: 'private', sections: {} }
    const response = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'invalid_agent_request' })
  })
})

test('aborts at the route deadline and emits one stable error event', async () => {
  const router = createAiAgentRouter({
    timeoutMs: 20,
    execute: async (_request, _emit, signal) => {
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      throw new Error('private path and key')
    },
  })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(requestBody()),
    })
    const events = frames(await response.text())
    assert.deepEqual(events, [{ type: 'error', code: 'agent_timeout' }])
  })
})

test('rebuilds only the derived search index and returns path-free statistics', async () => {
  const router = createAiAgentRouter({
    execute: async () => {},
    rebuild: async (config) => {
      assert.equal(config.embedding.batchSize, 4)
      return { mode: 'hybrid', sourceMessageCount: 30, chunkCount: 4 }
    },
  })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/index/rebuild`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ config: requestBody().config }),
    })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.doesNotMatch(text, /fake-private-key|staging|\\|:\\/u)
    assert.deepEqual(JSON.parse(text), { mode: 'hybrid', sourceMessageCount: 30, chunkCount: 4 })
  })
})
