import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_AI_CONFIG } from './aiConfig.js'
import { agentRequestConfig, rebuildSearchIndex } from './aiIndex.js'

test('maps the shared browser configuration without dropping embedding limits', () => {
  const config = {
    ...DEFAULT_AI_CONFIG,
    apiKey: 'chat-key',
    embedding: { ...DEFAULT_AI_CONFIG.embedding, apiKey: 'vector-key', batchSize: 17 },
  }

  const mapped = agentRequestConfig(config)

  assert.equal(mapped.apiKey, 'chat-key')
  assert.equal(mapped.embedding.apiKey, 'vector-key')
  assert.equal(mapped.embedding.batchSize, 17)
})

test('rebuilds through the path-free local endpoint and validates its result', async () => {
  const requests: unknown[] = []
  const result = await rebuildSearchIndex(DEFAULT_AI_CONFIG, async (input, init) => {
    requests.push({ input, body: JSON.parse(String(init?.body)) })
    return Response.json({ mode: 'keyword-only', chunkCount: 12 })
  })

  assert.deepEqual(result, { mode: 'keyword-only', chunkCount: 12 })
  assert.equal((requests[0] as { input: string }).input, '/api/ai/index/rebuild')
  assert.doesNotMatch(JSON.stringify(result), /path|apiKey/iu)
})

test('uses a stable error for failed or malformed rebuild responses', async () => {
  await assert.rejects(
    rebuildSearchIndex(DEFAULT_AI_CONFIG, async () => Response.json({ code: 'private-detail' }, { status: 503 })),
    /index_rebuild_failed/u,
  )
  await assert.rejects(
    rebuildSearchIndex(DEFAULT_AI_CONFIG, async () => Response.json({ mode: 'hybrid', chunkCount: -1 })),
    /index_rebuild_invalid/u,
  )
})
