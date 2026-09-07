import type { InsightsResponse, InsightNugget, InsightSummary, Overview } from '../../../shared/contracts/insights.js'
import { readActiveProductSet } from '../../data/catalogReader.js'
import { openCatalogWechatDatabase } from '../../data/productDatabases.js'
import { readCatalogInsights, readCatalogLibrary } from '../../data/productReaders.js'
import { sourceLibrary } from '../../utils/helpers.js'

type RawInsights = {
  conversations: Array<Record<string, unknown>>
  boards: Record<string, string>
}

export type InsightsQueryService = {
  insights: () => unknown
  overview: () => unknown
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildInsightsResponse(input: RawInsights): InsightsResponse {
  const byCategory: Record<string, InsightNugget[]> = {}
  const summaries: InsightSummary[] = []
  let nuggetCount = 0
  for (const conversation of input.conversations) {
    const convId = String(conversation.convId ?? '')
    const name = String(conversation.name ?? '')
    const isGroup = Boolean(conversation.isGroup)
    const summary = typeof conversation.summary === 'string' ? conversation.summary : ''
    if (summary) {
      summaries.push({
        convId,
        name,
        isGroup,
        summary,
        topics: strings(conversation.topics),
        keyPeople: strings(conversation.keyPeople),
      })
    }
    const nuggets = Array.isArray(conversation.nuggets) ? conversation.nuggets : []
    for (const value of nuggets) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const nugget = value as Record<string, unknown>
      const category = String(nugget.category ?? '其他')
      ;(byCategory[category] ??= []).push({
        ...nugget,
        category,
        title: String(nugget.title ?? ''),
        content: String(nugget.content ?? ''),
        importance: number(nugget.importance),
        conv: name,
        convId,
        isGroup,
      })
      nuggetCount += 1
    }
  }
  for (const values of Object.values(byCategory)) {
    values.sort((left, right) => number(right.importance) - number(left.importance))
  }
  return {
    convCount: input.conversations.length,
    nuggetCount,
    byCategory,
    summaries,
    boards: input.boards,
  }
}

export function createRuntimeInsightsQueryService(projectRoot: string): InsightsQueryService {
  return {
    insights() {
      return buildInsightsResponse(readCatalogInsights(readActiveProductSet(projectRoot)))
    },
    overview(): Overview {
      const active = readActiveProductSet(projectRoot)
      const opened = openCatalogWechatDatabase(projectRoot, () => active)
      if (!opened.db) throw new Error('DATA_PRODUCT_UNAVAILABLE')
      let chat: Overview['chat']
      try {
        const totals = opened.db.prepare(`
          SELECT count(*) AS conversations, sum(msg_count) AS messages,
                 sum(text_count) AS textMessages FROM conversations
        `).get() as { conversations: number; messages: number | null; textMessages: number | null }
        const contacts = opened.db.prepare('SELECT count(*) AS contacts FROM contacts').get() as { contacts: number }
        chat = {
          conversations: number(totals.conversations),
          messages: number(totals.messages),
          textMessages: number(totals.textMessages),
          contacts: number(contacts.contacts),
        }
      } finally {
        opened.db.close()
      }
      const library = readCatalogLibrary(active)
      const insights = readCatalogInsights(active).conversations
      const source = sourceLibrary(projectRoot)
      const nuggets = insights.reduce((sum, conversation) => (
        sum + (Array.isArray(conversation.nuggets) ? conversation.nuggets.length : 0)
      ), 0)
      return {
        chat,
        files: { archived: library.files.length, indexed: source.files.length, bytes: library.stats.bytes },
        insights: { conversations: insights.length, nuggets },
      }
    },
  }
}
