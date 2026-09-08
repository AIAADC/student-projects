import type { AgentRequestConfig } from '../types/aiAgent'
import type { AIConfig } from './aiConfig'

export type IndexRebuildResult = {
  mode: 'hybrid' | 'keyword-only'
  sourceMessageCount?: number
  chunkCount: number
}

export function agentRequestConfig(config: AIConfig): AgentRequestConfig {
  return {
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    contextWindow: config.contextWindow,
    contextStrategy: config.contextStrategy,
    embedding: {
      enabled: config.embedding.enabled,
      baseURL: config.embedding.baseURL,
      apiKey: config.embedding.apiKey,
      model: config.embedding.model,
      dimensions: config.embedding.dimensions,
      batchSize: config.embedding.batchSize,
    },
  }
}

function isCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export async function rebuildSearchIndex(
  config: AIConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<IndexRebuildResult> {
  const response = await fetchImpl('/api/ai/index/rebuild', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ config: agentRequestConfig(config) }),
  })
  if (!response.ok) throw new Error('index_rebuild_failed')
  const value = await response.json() as Record<string, unknown>
  if ((value.mode !== 'hybrid' && value.mode !== 'keyword-only') || !isCount(value.chunkCount)) {
    throw new Error('index_rebuild_invalid')
  }
  if (value.sourceMessageCount !== undefined && !isCount(value.sourceMessageCount)) {
    throw new Error('index_rebuild_invalid')
  }
  return {
    mode: value.mode,
    chunkCount: value.chunkCount as number,
    ...(value.sourceMessageCount === undefined ? {} : { sourceMessageCount: value.sourceMessageCount as number }),
  }
}
