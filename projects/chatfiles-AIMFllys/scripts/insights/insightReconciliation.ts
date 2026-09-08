import type {
  CurrentInsightConversation,
  InsightConversation,
  InsightNugget,
  InsightState,
} from './insightTypes.js'

type ReconcileInput = {
  current: CurrentInsightConversation[]
  legacy: InsightConversation[]
  states: InsightState[]
  ownerAliases: Record<string, string>
}

function conversationUsername(convId: string) {
  const parts = convId.split(':')
  if (parts.length < 3 || parts[0] !== 'wx' || !parts[1] || !parts[2]) {
    throw new Error(`Invalid WeChat conversation id: ${convId}`)
  }
  return parts.slice(2).join(':')
}

function conversationOwner(convId: string) {
  const parts = convId.split(':')
  if (parts.length < 3 || parts[0] !== 'wx' || !parts[1] || !parts[2]) {
    throw new Error(`Invalid WeChat conversation id: ${convId}`)
  }
  return parts[1]
}

function groupByUsername<T>(items: T[], id: (item: T) => string) {
  const grouped = new Map<string, T[]>()
  for (const item of items) {
    const username = conversationUsername(id(item))
    const matches = grouped.get(username) ?? []
    matches.push(item)
    grouped.set(username, matches)
  }
  return grouped
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

export function insightNuggetEvidenceKey(nugget: InsightNugget) {
  return JSON.stringify([
    nugget.category,
    nugget.title.trim(),
    nugget.content.trim(),
    [...(nugget.people ?? [])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
    nugget.date ?? '',
    nugget.importance ?? null,
  ])
}

function preferredState(states: InsightState[]) {
  return [...states].sort(
    (a, b) =>
      b.analyzedLastTime - a.analyzedLastTime ||
      b.analyzedTextCount - a.analyzedTextCount ||
      b.analyzedAt.localeCompare(a.analyzedAt),
  )[0]
}

export function reconcileLegacyInsights(input: ReconcileInput) {
  const currentByUsername = groupByUsername(input.current, (conversation) => conversation.id)
  for (const [username, matches] of currentByUsername) {
    if (matches.length !== 1) {
      throw new Error(`Current conversation username is ambiguous: ${username}`)
    }
  }

  const legacyByUsername = groupByUsername(input.legacy, (conversation) => conversation.convId)
  const statesByUsername = groupByUsername(input.states, (state) => state.convId)
  const conversations: InsightConversation[] = []
  const states: InsightState[] = []
  let canonicalNuggets = 0

  for (const current of input.current) {
    const username = conversationUsername(current.id)
    const legacyMatches = legacyByUsername.get(username) ?? []
    if (legacyMatches.length === 0) continue
    const canonicalOwner = conversationOwner(current.id)
    for (const legacyConversation of legacyMatches) {
      const legacyOwner = conversationOwner(legacyConversation.convId)
      if (legacyOwner !== canonicalOwner && input.ownerAliases[legacyOwner] !== canonicalOwner) {
        throw new Error(`Legacy owner alias is not mapped to the canonical owner: ${legacyOwner}`)
      }
    }

    const state = preferredState(statesByUsername.get(username) ?? [])
    const preferred = legacyMatches.find((conversation) => conversation.convId === state?.convId)
      ?? legacyMatches[0]!
    const ordered = [preferred, ...legacyMatches.filter((conversation) => conversation !== preferred)]
    const seenNuggets = new Set<string>()
    const nuggets: InsightNugget[] = []
    for (const conversation of ordered) {
      for (const nugget of conversation.nuggets ?? []) {
        const key = insightNuggetEvidenceKey(nugget)
        if (seenNuggets.has(key)) continue
        seenNuggets.add(key)
        nuggets.push(nugget)
      }
    }

    canonicalNuggets += nuggets.length
    const legacySummaries = ordered.flatMap((conversation) => [
      { convId: conversation.convId, summary: conversation.summary },
      ...(conversation.legacySummaries ?? []),
    ]).filter((entry, index, entries) =>
      Boolean(entry.summary?.trim())
      && entries.findIndex((candidate) =>
        candidate.convId === entry.convId && candidate.summary === entry.summary,
      ) === index,
    )
    conversations.push({
      convId: current.id,
      name: current.display,
      isGroup: current.isGroup,
      summary: preferred.summary,
      topics: uniqueStrings(ordered.flatMap((conversation) => conversation.topics ?? [])),
      keyPeople: uniqueStrings(ordered.flatMap((conversation) => conversation.keyPeople ?? [])),
      nuggets,
      legacySummaries,
    })
    if (state) states.push({ ...state, convId: current.id })
  }

  const legacyNuggets = input.legacy.reduce(
    (sum, conversation) => sum + (conversation.nuggets?.length ?? 0),
    0,
  )

  return {
    conversations,
    states,
    metrics: {
      legacyFiles: input.legacy.length,
      legacyConversationKeys: legacyByUsername.size,
      canonicalConversations: conversations.length,
      mergedAliasFiles: input.legacy.length - legacyByUsername.size,
      legacyNuggets,
      canonicalNuggets,
      duplicateNuggetsRemoved: legacyNuggets - canonicalNuggets,
    },
  }
}

export function planInsightDelta(
  conversations: CurrentInsightConversation[],
  states: InsightState[],
  minimumGrowth: number,
) {
  const stateById = new Map(states.map((state) => [state.convId, state]))
  const entries: Array<{
    conversation: CurrentInsightConversation
    kind: 'new' | 'grown'
    since: number
    sinceMessageUid: string
    sinceSequence: number | null
    previousTextCount: number
  }> = []
  const metrics = { new: 0, grown: 0, accumulated: 0, unchanged: 0 }

  for (const conversation of conversations) {
    const state = stateById.get(conversation.id)
    if (!state) {
      entries.push({
        conversation, kind: 'new', since: 0, sinceMessageUid: '', sinceSequence: null,
        previousTextCount: 0,
      })
      metrics.new++
      continue
    }

    const growth = conversation.textCount - state.analyzedTextCount
    if (growth >= minimumGrowth) {
      entries.push({
        conversation,
        kind: 'grown',
        since: state.analyzedLastTime,
        sinceMessageUid: state.analyzedLastMessageUid ?? '',
        sinceSequence: state.analyzedLastSequence ?? null,
        previousTextCount: state.analyzedTextCount,
      })
      metrics.grown++
    } else if (growth > 0) {
      metrics.accumulated++
    } else {
      metrics.unchanged++
    }
  }

  return { entries, metrics }
}
