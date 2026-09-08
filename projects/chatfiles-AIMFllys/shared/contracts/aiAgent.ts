import { z } from 'zod/v4'
import { sha256IdSchema } from './primitives.js'

/** AI request, stream, citation, and summary DTOs shared across runtimes. */
export type AgentCitation = {
  citation: string
  kind: 'message' | 'file'
  id: string
  conversationId?: string
  time?: number
  title?: string
}

export type AgentSummaryItem = { text: string; sourceUids: string[] }
export type AgentSummarySections = {
  facts: AgentSummaryItem[]
  people: AgentSummaryItem[]
  dates: AgentSummaryItem[]
  quotes: AgentSummaryItem[]
  decisions: AgentSummaryItem[]
  disputes: AgentSummaryItem[]
  openItems: AgentSummaryItem[]
}
export type AgentContextSummary = {
  version: 1
  sourceHash: string
  sourceRange: { firstUid: string; lastUid: string; count: number }
  sections: AgentSummarySections
}

export type AgentStreamEvent =
  | { type: 'step'; step: number; label: string }
  | { type: 'tool'; step: number; name: string; status: 'running' | 'complete' | 'rejected' | 'duplicate' }
  | ({ type: 'citation' } & AgentCitation)
  | { type: 'delta'; content: string }
  | {
      type: 'done'
      mode: 'agent' | 'fallback'
      strategy: 'recent' | 'summary'
      evidenceCount: number
      steps: number
      summary?: AgentContextSummary
      summaryReason?: 'not_needed' | 'summary_invalid' | 'summary_failed'
    }
  | { type: 'error'; code: string }

export type AgentClientTurn = { role: 'user' | 'assistant'; content: string }

export type AgentRequestConfig = {
  baseURL: string
  apiKey: string
  model: string
  temperature: number
  contextWindow: number
  contextStrategy: 'recent' | 'summary'
  embedding: {
    enabled: boolean
    baseURL: string
    apiKey: string
    model: string
    dimensions: number
    batchSize: number
  }
}

export type AgentStreamRequest = {
  question: string
  conversationId?: string
  conversationName?: string
  anchorMessageUid?: string
  history: AgentClientTurn[]
  summary?: AgentContextSummary
  config: AgentRequestConfig
}

const boundedTextSchema = (maximum: number) => z.string()
  .min(1)
  .refine((value) => [...value].length <= maximum, `must contain at most ${maximum} code points`)

const summaryUidSchema = boundedTextSchema(128)

export const agentSummaryItemSchema = z.object({
  text: boundedTextSchema(2_000),
  sourceUids: z.array(summaryUidSchema).min(1).max(32),
}).transform((item) => ({ ...item, sourceUids: [...new Set(item.sourceUids)] })) satisfies z.ZodType<AgentSummaryItem>

export const agentSummarySectionsSchema = z.object({
  facts: z.array(agentSummaryItemSchema).max(64),
  people: z.array(agentSummaryItemSchema).max(64),
  dates: z.array(agentSummaryItemSchema).max(64),
  quotes: z.array(agentSummaryItemSchema).max(64),
  decisions: z.array(agentSummaryItemSchema).max(64),
  disputes: z.array(agentSummaryItemSchema).max(64),
  openItems: z.array(agentSummaryItemSchema).max(64),
}) satisfies z.ZodType<AgentSummarySections>

export const agentContextSummarySchema = z.object({
  version: z.literal(1),
  sourceHash: sha256IdSchema,
  sourceRange: z.object({
    firstUid: summaryUidSchema,
    lastUid: summaryUidSchema,
    count: z.number().int().min(1).max(60),
  }),
  sections: agentSummarySectionsSchema,
}) satisfies z.ZodType<AgentContextSummary>

export function parseAgentContextSummary(value: unknown): AgentContextSummary | undefined {
  const parsed = agentContextSummarySchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
