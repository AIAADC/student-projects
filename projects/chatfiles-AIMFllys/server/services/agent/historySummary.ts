import { createHash } from 'node:crypto'
import type {
  AgentClientTurn,
  AgentContextSummary,
  AgentSummarySections,
} from '../../../shared/contracts/aiAgent.js'
import { parseAgentContextSummary } from '../../../shared/contracts/aiAgent.js'
import { estimateTokens, planContextBudget, takeWholeMessages } from '../../../shared/ai/context.js'
import type { AgentUpstream } from './agentLoop.js'
import {
  createContextSummary,
  resolveSummaryStrategy,
  type SummarySourceMessage,
} from './contextSummary.js'

const emptySections = (): AgentSummarySections => ({
  facts: [], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
})

export function historySourceMessages(history: readonly AgentClientTurn[]): SummarySourceMessage[] {
  return history.map((turn, index) => {
    const digest = createHash('sha256').update(`${turn.role}\n${turn.content}`, 'utf8').digest('hex').slice(0, 16)
    return { messageUid: `turn:${index}:${digest}`, time: index, text: `${turn.role}: ${turn.content}` }
  })
}

function parsedSections(content: string) {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')
  let value: unknown
  try { value = JSON.parse(trimmed) } catch { return undefined }
  const shell = {
    version: 1, sourceHash: 'a'.repeat(64),
    sourceRange: { firstUid: 'turn:0:fixture', lastUid: 'turn:0:fixture', count: 1 },
    sections: value,
  }
  return parseAgentContextSummary(shell)?.sections
}

function prompt(previous: AgentContextSummary | undefined, sources: readonly SummarySourceMessage[]) {
  return [
    { role: 'system' as const, content: '你压缩 AI 研究对话。只输出 JSON 对象，键必须为 facts、people、dates、quotes、decisions、disputes、openItems。每项为 {text,sourceUids}；sourceUids 只能使用输入 turn UID 且不得为空。保留事实、人物、日期、直接引语、决定、分歧和未决项；合并重复但不得编造。' },
    { role: 'user' as const, content: JSON.stringify({ previous: previous?.sections ?? emptySections(), turns: sources }) },
  ]
}

function recentHistory(history: readonly AgentClientTurn[], contextWindow: number, strategy: 'recent' | 'summary') {
  const budget = planContextBudget({ contextWindow, strategy })
  return {
    budget,
    selected: takeWholeMessages(history, budget.recentMax, (turn) => estimateTokens(turn.content) + 4),
  }
}

function validPrefixSummary(summary: AgentContextSummary | undefined, sources: readonly SummarySourceMessage[]) {
  if (!summary || summary.sourceRange.count > sources.length) return undefined
  const covered = sources.slice(0, summary.sourceRange.count)
  return resolveSummaryStrategy('summary', summary, covered).strategy === 'summary' ? summary : undefined
}

async function buildSummary(
  sources: readonly SummarySourceMessage[],
  previous: AgentContextSummary | undefined,
  upstream: AgentUpstream,
  summaryMax: number,
  signal?: AbortSignal,
) {
  const start = previous?.sourceRange.count ?? 0
  const incoming = sources.slice(start)
  if (!incoming.length) return previous
  const inputTokens = incoming.reduce((sum, item) => sum + estimateTokens(item.text) + 8, 0)
  if (inputTokens > Math.max(6_000, summaryMax * 3)) throw new Error('summary_input_too_large')
  const response = await upstream({ messages: prompt(previous, incoming), signal })
  const sections = parsedSections(response.content)
  if (!sections || Object.values(sections).every((items) => items.length === 0)) {
    throw new Error('summary_invalid')
  }
  const summary = createContextSummary(sources, sections)
  if (estimateTokens(JSON.stringify(summary)) > summaryMax) throw new Error('summary_too_large')
  return summary
}

export async function prepareHistoryContext(input: {
  requested: 'recent' | 'summary'
  history: readonly AgentClientTurn[]
  summary?: AgentContextSummary
  contextWindow: number
  upstream: AgentUpstream
  signal?: AbortSignal
}) {
  if (input.requested === 'recent') {
    const recent = recentHistory(input.history, input.contextWindow, 'recent')
    return { strategy: 'recent' as const, history: recent.selected.messages }
  }
  const compact = recentHistory(input.history, input.contextWindow, 'summary')
  const omitted = input.history.slice(0, compact.selected.omitted)
  if (!omitted.length) {
    return { strategy: 'summary' as const, history: compact.selected.messages, reason: 'not_needed' as const }
  }
  const sources = historySourceMessages(omitted)
  const valid = validPrefixSummary(input.summary, sources)
  if (valid?.sourceRange.count === sources.length) {
    return { strategy: 'summary' as const, history: compact.selected.messages, summary: valid }
  }
  try {
    const summary = await buildSummary(sources, valid, input.upstream, compact.budget.summaryMax, input.signal)
    return { strategy: 'summary' as const, history: compact.selected.messages, summary }
  } catch (error) {
    const recent = recentHistory(input.history, input.contextWindow, 'recent')
    return {
      strategy: 'recent' as const,
      history: recent.selected.messages,
      reason: error instanceof Error && error.message === 'summary_invalid'
        ? 'summary_invalid' as const
        : 'summary_failed' as const,
    }
  }
}
