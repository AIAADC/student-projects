import path from 'node:path'
import type { AgentRequestConfig, AgentStreamEvent, AgentStreamRequest } from '../../../shared/contracts/aiAgent.js'
import { createRuntimeOperationExecutor } from '../../application/runtimeOperationExecutor.js'
import { openCatalogWechatDatabase } from '../../data/productDatabases.js'
import { root } from '../../utils/helpers.js'
import { buildSearchIndex } from '../search/buildSearchIndex.js'
import { runAgent } from './agentLoop.js'
import { createAgentOperationRegistry } from './agentOperationRegistry.js'
import { prepareHistoryContext } from './historySummary.js'
import { createOpenAIUpstream } from './openAIUpstream.js'

export async function executeAgentRuntime(
  request: AgentStreamRequest,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
  projectRoot = root,
) {
  const operations = createRuntimeOperationExecutor({ projectRoot, config: request.config, signal })
  const registry = createAgentOperationRegistry(operations)
  const upstream = createOpenAIUpstream(request.config)
  if (request.config.contextStrategy === 'summary') emit({ type: 'step', step: 0, label: '校验较早对话摘要' })
  const prepared = await prepareHistoryContext({
    requested: request.config.contextStrategy, history: request.history, summary: request.summary,
    contextWindow: request.config.contextWindow, upstream, signal,
  })
  return await runAgent({
    question: request.question, conversationId: request.conversationId,
    conversationName: request.conversationName, anchorMessageUid: request.anchorMessageUid,
    strategy: prepared.strategy, history: prepared.history, summary: prepared.summary,
    summaryReason: prepared.reason, registry, upstream, emit, signal,
  })
}

let rebuildActive = false

export async function rebuildSearchIndexRuntime(
  config: AgentRequestConfig,
  signal: AbortSignal,
  projectRoot = root,
) {
  if (rebuildActive) throw new Error('index_rebuild_active')
  rebuildActive = true
  const opened = openCatalogWechatDatabase(projectRoot)
  try {
    if (!opened.db) throw new Error('database_unavailable')
    const sourceFingerprint = opened.active.status.products.wechat.fingerprint
    if (!sourceFingerprint) throw new Error('database_unavailable')
    const dataDir = path.join(projectRoot, 'data')
    return await buildSearchIndex({
      sourceDb: opened.db,
      sourceFingerprint,
      currentPath: path.join(dataDir, 'ai-index.current.db'),
      stagingPath: path.join(dataDir, `ai-index.staging-${process.pid}-${Date.now()}.db`),
      ...(config.embedding.enabled ? { embedding: {
        baseURL: config.embedding.baseURL,
        apiKey: config.embedding.apiKey || config.apiKey,
        model: config.embedding.model,
        dimensions: config.embedding.dimensions,
        batchSize: config.embedding.batchSize,
      } } : {}),
      signal,
    })
  } finally {
    opened.db?.close()
    rebuildActive = false
  }
}
