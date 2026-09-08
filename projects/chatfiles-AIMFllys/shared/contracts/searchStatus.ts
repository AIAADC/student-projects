import { derivedSearchStatusSchema, type DerivedSearchStatus } from './dataStatus.js'

export const SEARCH_INDEX_SCHEMA_VERSION = 2

export type SearchIndexEvidence = {
  schemaVersion: number
  sourceFingerprint: string
  declaredChunkCount: number
  actualChunkCount: number
  vectorCount: number
  embeddingModel: string | null
  embeddingDimensions: number | null
  integrityOk: boolean
}

export function classifySearchIndex(
  evidence: SearchIndexEvidence,
  expectedFingerprint: string | null,
): DerivedSearchStatus {
  const hasModel = evidence.embeddingModel !== null
  const hasDimensions = evidence.embeddingDimensions !== null
  const invalid = !evidence.integrityOk
    || evidence.schemaVersion !== SEARCH_INDEX_SCHEMA_VERSION
    || evidence.declaredChunkCount !== evidence.actualChunkCount
    || hasModel !== hasDimensions
    || (hasModel && evidence.vectorCount !== evidence.actualChunkCount)
  if (invalid) {
    return derivedSearchStatusSchema.parse({ state: 'invalid',issues: ['search_index_invalid'] })
  }
  const mode = hasModel ? 'hybrid' as const : 'keyword-only' as const
  if (!expectedFingerprint || evidence.sourceFingerprint !== expectedFingerprint) {
    return derivedSearchStatusSchema.parse({
      state: 'stale',mode,issues: ['search_source_mismatch'],
    })
  }
  return derivedSearchStatusSchema.parse({ state: 'ready',mode,issues: [] })
}
