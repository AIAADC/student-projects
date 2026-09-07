import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_AI_CONFIG,
  MAX_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
  loadAIConfig,
  isConfigured,
  normalizeAIConfig,
  saveAIConfig,
} from './aiConfig.js'

function memoryStorage(initial?: string) {
  const values = new Map<string, string>()
  if (initial !== undefined) values.set('chatfiles.ai.config', initial)
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
    value: () => values.get('chatfiles.ai.config') ?? '',
  }
}

test('migrates legacy thresholds and rejects unsupported context strategies', () => {
  const storage = memoryStorage(JSON.stringify({
    baseURL: ' https://example.test/v1/ ', apiKey: ' secret ', model: ' model-a ',
    threshold: 256_000, temperature: 9, contextStrategy: 'invented',
  }))
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  const loaded = loadAIConfig()
  assert.equal(loaded.contextWindow, 256_000)
  assert.equal(loaded.contextStrategy, 'recent')
  assert.equal(loaded.threshold, 179_200)
  assert.equal(loaded.temperature, 2)
  assert.equal(loaded.baseURL, 'https://example.test/v1')
  assert.equal(loaded.apiKey, 'secret')
})

test('clamps model and embedding ranges while retaining a valid summary strategy', () => {
  const low = normalizeAIConfig({ contextWindow: 1, embedding: { dimensions: 0, batchSize: 0 } })
  assert.equal(low.contextWindow, MIN_CONTEXT_WINDOW)
  assert.equal(low.embedding.dimensions, 1)
  assert.equal(low.embedding.batchSize, 1)
  const high = normalizeAIConfig({
    contextWindow: Number.MAX_SAFE_INTEGER,
    contextStrategy: 'summary',
    embedding: { enabled: true, dimensions: 99_999, batchSize: 9_999, model: ' 向量模型 ' },
  })
  assert.equal(high.contextWindow, MAX_CONTEXT_WINDOW)
  assert.equal(high.contextStrategy, 'summary')
  assert.equal(high.embedding.dimensions, 8_192)
  assert.equal(high.embedding.batchSize, 256)
  assert.equal(high.embedding.model, '向量模型')
})

test('normalizes before saving and keeps embedding keys only in browser storage', () => {
  const storage = memoryStorage()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  saveAIConfig({
    ...DEFAULT_AI_CONFIG,
    contextStrategy: 'summary',
    embedding: { ...DEFAULT_AI_CONFIG.embedding, enabled: true, apiKey: ' local-key ', batchSize: 999 },
  })
  const serialized = storage.value()
  assert.equal(JSON.parse(serialized).embedding.batchSize, 256)
  assert.match(serialized, /local-key/u)
  assert.equal(loadAIConfig().embedding.apiKey, 'local-key')
})

test('allows a keyless local OpenAI-compatible endpoint', () => {
  assert.equal(isConfigured({ ...DEFAULT_AI_CONFIG, baseURL: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'local' }), true)
})
