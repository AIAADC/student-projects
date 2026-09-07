import type { DatabaseSync } from 'node:sqlite'
import { keywordSearch } from './keywordSearch.js'
import { reciprocalRankFusion } from './rankFusion.js'
import { readSearchMetadata } from './searchSchema.js'
import type { RankedSearchHit, SearchFilters } from './searchTypes.js'
import { vectorSearch, type VectorExtensionLoader } from './vectorSearch.js'

export type HybridSearchResult = {
  mode: 'hybrid' | 'keyword-only'
  reason?: 'not_configured' | 'embedding_mismatch' | 'vector_unavailable'
  hits: RankedSearchHit[]
}

export function hybridSearch(
  db: DatabaseSync,
  input: {
    query: string
    queryVector?: readonly number[]
    embeddingModel?: string
    embeddingDimensions?: number
    filters?: SearchFilters
    limit?: number
  },
  loader?: VectorExtensionLoader,
): HybridSearchResult {
  const limit = Math.max(1, Math.min(input.limit ?? input.filters?.limit ?? 20, 100))
  const candidateLimit = Math.min(limit * 4, 100)
  const keyword = keywordSearch(db, { query: input.query, filters: input.filters, limit: candidateLimit })
  if (!input.queryVector || !input.embeddingModel || !input.embeddingDimensions) {
    return { mode: 'keyword-only', reason: 'not_configured', hits: keyword.slice(0, limit) }
  }
  const metadata = readSearchMetadata(db)
  if (
    !metadata
    || metadata.embeddingModel !== input.embeddingModel
    || metadata.embeddingDimensions !== input.embeddingDimensions
    || input.queryVector.length !== input.embeddingDimensions
  ) return { mode: 'keyword-only', reason: 'embedding_mismatch', hits: keyword.slice(0, limit) }
  const vectors = vectorSearch(db, input.queryVector, { filters: input.filters, limit: candidateLimit }, loader)
  if (!vectors.available) {
    return { mode: 'keyword-only', reason: 'vector_unavailable', hits: keyword.slice(0, limit) }
  }
  return { mode: 'hybrid', hits: reciprocalRankFusion([keyword, vectors.hits], { limit }) }
}
