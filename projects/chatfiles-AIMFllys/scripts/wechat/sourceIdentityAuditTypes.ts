import type { DatabaseSync } from 'node:sqlite'

export type SourceIdentityAuditIssue = {
  code: string
  count: number
  detail: string
  samples: string[]
}

export type SourceIdentityAuditResult = {
  ok: boolean
  metrics: {
    outputConversations: number
    matchedConversationDisplays: number
    outputMessages: number
    matchedMessages: number
    sourceShards: number
    sourceTables: number
    sourceRowsScanned: number
    outputReplacementCharacters: number
    sourceVerifiedReplacementCharacters: number
  }
  issues: SourceIdentityAuditIssue[]
}

export type OutputConversation = {
  id: string
  sourceSnapshot: string
  owner: string
  username: string
  display: string
}

export type OutputMessage = {
  convId: string
  messageUid: string
  sourceSnapshot: string
  sourceDb: string
  sourceTable: string
  localId: number
  serverId: string
  sortSeq: number
  time: number
  sender: string
  senderName: string
  senderPrefix: string
  text: string
  conversationSnapshot: string
  owner: string
  peer: string
  isGroup: boolean
}

export type OutputMessageWithRawType = OutputMessage & { rawType: string }

export type SourceShard = {
  db: DatabaseSync
  tables: ReadonlySet<string>
  idToName: ReadonlyMap<number, string>
  displayNames: ReadonlyMap<string, string>
}

export type MutableIssue = {
  count: number
  detail: string
  samples: string[]
}
