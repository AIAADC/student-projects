export type InsightNugget = {
  category: string
  title: string
  content: string
  people?: string[]
  date?: string
  importance?: number
}

export type InsightConversation = {
  convId: string
  name: string
  isGroup: boolean
  summary: string
  topics: string[]
  keyPeople: string[]
  nuggets: InsightNugget[]
  legacySummaries?: Array<{ convId: string; summary: string }>
}

export type InsightState = {
  convId: string
  analyzedTextCount: number
  analyzedLastTime: number
  analyzedAt: string
  analyzedLastMessageUid?: string
  analyzedLastSequence?: number
}

export type CurrentInsightConversation = {
  id: string
  display: string
  isGroup: boolean
  textCount: number
  firstTime: number
  lastTime: number
}

export type InsightMessage = {
  messageUid?: string
  canonicalSequence?: number
  time: number
  senderName: string
  text: string
}

export type InsightBoardRecord = {
  convId: string
  conversationName: string
  nugget: InsightNugget
}
