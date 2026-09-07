import type { AgentContextSummary } from '../types/aiAgent'
import { parseAgentContextSummary } from './aiSummaryValidation'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const key = (conversationId: string) => `chatfiles.ai.summary.${conversationId}`
const MAX_STORED_CHARACTERS = 256_000

export function loadAgentSummary(
  conversationId: string,
  storage: StorageLike = localStorage,
): AgentContextSummary | undefined {
  try {
    const raw = storage.getItem(key(conversationId))
    if (!raw || raw.length > MAX_STORED_CHARACTERS) return undefined
    return parseAgentContextSummary(JSON.parse(raw))
  } catch {
    return undefined
  }
}

export function saveAgentSummary(
  conversationId: string,
  summary: AgentContextSummary,
  storage: StorageLike = localStorage,
) {
  try {
    const validated = parseAgentContextSummary(summary)
    if (!validated) return
    const serialized = JSON.stringify(validated)
    if (serialized.length <= MAX_STORED_CHARACTERS) storage.setItem(key(conversationId), serialized)
  } catch {
    // Storage quotas must not break the research flow.
  }
}

export function clearAgentSummary(conversationId: string, storage: StorageLike = localStorage) {
  try { storage.removeItem(key(conversationId)) } catch { /* ignore unavailable storage */ }
}
