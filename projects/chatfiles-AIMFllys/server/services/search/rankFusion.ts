import type { RankedSearchHit } from './searchTypes.js'

export function reciprocalRankFusion(
  lists: readonly (readonly RankedSearchHit[])[],
  options: { k?: number; limit?: number } = {},
) {
  const k = Math.max(1, options.k ?? 60)
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100))
  const combined = new Map<string, { hit: RankedSearchHit; score: number; bestRank: number }>()
  for (const list of lists) {
    for (let index = 0; index < list.length; index += 1) {
      const hit = list[index]
      const rank = hit.rank > 0 ? hit.rank : index + 1
      const existing = combined.get(hit.chunkId)
      if (existing) {
        existing.score += 1 / (k + rank)
        existing.bestRank = Math.min(existing.bestRank, rank)
      } else {
        combined.set(hit.chunkId, { hit, score: 1 / (k + rank), bestRank: rank })
      }
    }
  }
  return [...combined.values()]
    .sort((left, right) => (
      right.score - left.score
      || left.bestRank - right.bestRank
      || left.hit.conversationId.localeCompare(right.hit.conversationId)
      || right.hit.lastSequence - left.hit.lastSequence
      || left.hit.chunkId.localeCompare(right.hit.chunkId)
    ))
    .slice(0, limit)
    .map((item, index) => ({ ...item.hit, rank: index + 1, score: item.score, source: 'hybrid' as const }))
}
