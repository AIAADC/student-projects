import crypto from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { AssetBundleBinding } from './assetBundleBinding.js'
import type {
  ConversationAssetCounts,
  ConversationAssetMetrics,
} from './conversationAssetBuilderSupport.js'

export function createAssetRunReceipt(input: {
  runId: string
  completedAt: string
  binding: AssetBundleBinding
  counts: ConversationAssetCounts
  metrics: ConversationAssetMetrics
  materializationEvidenceSha256: string
}) {
  const payload = stableJson({
    schemaVersion: 2,
    runId: input.runId,
    completedAt: input.completedAt,
    binding: input.binding,
    counts: input.counts,
    metrics: input.metrics,
    materializationEvidenceSha256: input.materializationEvidenceSha256,
  })
  return `sha256:${crypto.createHash('sha256').update(payload, 'utf8').digest('hex')}`
}

export function createMaterializationEvidenceDigest(database: DatabaseSync) {
  const rows = database.prepare(`
    SELECT source_id,asset_id,status,preview_status,failure_reason,
           materialized_relative_path,materialized_size,materialized_content_sha256,media_format
    FROM asset_materializations ORDER BY source_id,asset_id
  `).all().map((row) => ({ ...row }))
  return `sha256:${crypto.createHash('sha256').update(stableJson(rows), 'utf8').digest('hex')}`
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => [key, canonicalValue(item)]))
  }
  return value
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalValue(value))
}
