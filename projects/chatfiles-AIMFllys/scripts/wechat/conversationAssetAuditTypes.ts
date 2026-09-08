import type { ConversationAssetCounts } from './conversationAssetBuilderSupport.js'

export type ConversationAssetAuditIssue = { code: string; count: number }

export type ConversationAssetAuditResult = {
  ok: boolean
  counts: ConversationAssetCounts
  metrics: {
    artifacts: number
    sourcePaths: number
    resources: number
    links: number
    voiceAttempts: number
  }
  issues: ConversationAssetAuditIssue[]
}
