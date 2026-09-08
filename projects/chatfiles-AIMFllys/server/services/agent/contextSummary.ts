import { createHash } from 'node:crypto'
import type {
  AgentContextSummary as ContextSummary,
  AgentSummaryItem as SummaryItem,
  AgentSummarySections as SummarySections,
} from '../../../shared/contracts/aiAgent.js'

export type SummarySourceMessage = { messageUid: string; time: number; text: string }
export type { ContextSummary, SummaryItem, SummarySections }

const sectionNames: Array<keyof SummarySections> = [
  'facts', 'people', 'dates', 'quotes', 'decisions', 'disputes', 'openItems',
]

export function summarySourceHash(messages: readonly SummarySourceMessage[]) {
  const hash = createHash('sha256')
  for (const message of messages) {
    hash.update(`${message.messageUid.length}:${message.messageUid}|${message.time}|${message.text.length}:`, 'utf8')
    hash.update(message.text, 'utf8')
    hash.update('\n', 'utf8')
  }
  return hash.digest('hex')
}

function validateSections(sections: SummarySections, sourceUids: Set<string>) {
  for (const name of sectionNames) {
    if (!Array.isArray(sections[name])) throw new Error('summary_invalid')
    for (const item of sections[name]) {
      if (!item.text?.trim() || !Array.isArray(item.sourceUids) || item.sourceUids.length === 0) {
        throw new Error('summary_citation_open')
      }
      if (item.sourceUids.some((uid) => !sourceUids.has(uid))) throw new Error('summary_citation_open')
    }
  }
}

export function mergeSummarySections(parts: readonly SummarySections[]): SummarySections {
  const merged: SummarySections = {
    facts: [], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
  }
  for (const name of sectionNames) {
    const seen = new Set<string>()
    for (const part of parts) {
      for (const item of part[name] ?? []) {
        const normalized = { text: item.text.trim(), sourceUids: [...new Set(item.sourceUids)].sort() }
        const key = `${normalized.text}\n${normalized.sourceUids.join('\n')}`
        if (!seen.has(key)) {
          seen.add(key)
          merged[name].push(normalized)
        }
      }
    }
  }
  return merged
}

export function createContextSummary(
  messages: readonly SummarySourceMessage[],
  sections: SummarySections,
): ContextSummary {
  if (!messages.length) throw new Error('summary_source_empty')
  const sourceUids = new Set(messages.map((message) => message.messageUid))
  if (sourceUids.size !== messages.length) throw new Error('summary_source_duplicate')
  const normalized = mergeSummarySections([sections])
  validateSections(normalized, sourceUids)
  return {
    version: 1,
    sourceHash: summarySourceHash(messages),
    sourceRange: {
      firstUid: messages[0].messageUid,
      lastUid: messages[messages.length - 1].messageUid,
      count: messages.length,
    },
    sections: normalized,
  }
}

export function resolveSummaryStrategy(
  requested: 'recent' | 'summary',
  summary: ContextSummary | undefined,
  messages: readonly SummarySourceMessage[],
) {
  if (requested === 'recent') return { strategy: 'recent' as const }
  if (!summary) return { strategy: 'recent' as const, reason: 'summary_missing' as const }
  if (
    summary.version !== 1
    || summary.sourceHash !== summarySourceHash(messages)
    || summary.sourceRange.count !== messages.length
    || summary.sourceRange.firstUid !== messages[0]?.messageUid
    || summary.sourceRange.lastUid !== messages.at(-1)?.messageUid
  ) return { strategy: 'recent' as const, reason: 'summary_stale' as const }
  try { validateSections(summary.sections, new Set(messages.map((message) => message.messageUid))) } catch {
    return { strategy: 'recent' as const, reason: 'summary_invalid' as const }
  }
  return { strategy: 'summary' as const, summary }
}
