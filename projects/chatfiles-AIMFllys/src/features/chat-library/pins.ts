const PIN_STORAGE_VERSION = 1

type PinPayload = {
  version: number
  ids: string[]
}

function uniqueIds(ids: readonly string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of ids) {
    const id = value.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export function parsePinnedConversationIds(raw: string | null, validIds: ReadonlySet<string>) {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as Partial<PinPayload>
    if (value.version !== PIN_STORAGE_VERSION || !Array.isArray(value.ids)) return []
    if (!value.ids.every((id) => typeof id === 'string')) return []
    return uniqueIds(value.ids).filter((id) => validIds.has(id))
  } catch {
    return []
  }
}

export function serializePinnedConversationIds(ids: readonly string[]) {
  return JSON.stringify({ version: PIN_STORAGE_VERSION, ids: uniqueIds(ids) })
}

export function togglePinnedConversation(ids: readonly string[], conversationId: string) {
  const current = uniqueIds(ids)
  const id = conversationId.trim()
  if (!id) return current
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
}

export function orderConversationsPinnedFirst<T extends { id: string; last_time: number }>(
  conversations: readonly T[],
  pinnedIds: readonly string[],
) {
  const pinned = new Set(pinnedIds)
  return [...conversations].sort((left, right) => {
    const pinOrder = Number(pinned.has(right.id)) - Number(pinned.has(left.id))
    return pinOrder || right.last_time - left.last_time
  })
}
