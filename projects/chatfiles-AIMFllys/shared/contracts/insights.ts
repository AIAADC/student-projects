import type { Category, LibraryFile } from './files.js'

export type ValueCandidate = {
  id: string
  path: string
  root: string
  relativePath: string
  name: string
  ext: string
  preview: LibraryFile['preview']
  sourceApp: LibraryFile['sourceApp']
  size: number
  modified: string
  score: number
  level: 'high' | 'medium' | 'low'
  bucket: Category | '复核'
  reasons: string[]
  action: 'review' | 'archive_candidate' | 'source_only'
}

export type ValueCandidateIndex = {
  generatedAt: string
  totals: {
    sourceFiles: number
    archivedFiles: number
    unarchivedFiles: number
    representedByArchive: number
    duplicateCandidatesSkipped: number
    candidates: number
    high: number
    medium: number
    low: number
  }
  byBucket: Record<string, number>
  byPreview: Record<string, number>
  candidates: ValueCandidate[]
}

export type DatabaseTextSample = {
  table: string
  column: string
  valuePreview: string
  signals: string[]
}

export type DatabaseTableAnalysis = {
  name: string
  rowCount: number
  columns: Array<{
    name: string
    type: string
  }>
  focus: string
  suspectedMessage: boolean
  textSamples: DatabaseTextSample[]
}

export type DatabaseAnalysis = {
  generatedAt: string
  totals: {
    readableDatabases: number
    unreadableDatabases: number
    analyzedTables: number
    suspectedMessageTables: number
    textSamples: number
  }
  databases: Array<{
    path: string
    readable: boolean
    size: number
    modified: string
    app: string
    detail: string
    tables: DatabaseTableAnalysis[]
  }>
}

export type CourseItem = {
  id: string
  name: string
  credits: number
  kind: 'archive' | 'forecast'
  scorePercent?: number
  pass?: boolean
  examDate?: string
  usualWeight?: number
  examWeight?: number
  notes?: string
  usualParts?: Array<{ id: string; label: string; weight: number; score: number }>
  examParts?: Array<{ id: string; label: string; weight: number; score: number }>
}

export type KnowledgeSection = {
  id: string
  title: string
  scope: string
  tags: string[]
  content: string
}

export type KnowledgeBase = {
  generatedAt: string
  sourceStatus: Array<{
    source: string
    status: 'done' | 'partial' | 'blocked'
    detail: string
  }>
  coursePlan: CourseItem[]
  sections: KnowledgeSection[]
}

// ---- decrypted WeChat archive (GET /api/overview, /api/wechat/*, /api/insights) ----

export type Overview = {
  chat: {
    conversations: number
    messages: number
    textMessages: number
    contacts: number
  }
  files: {
    archived: number
    indexed: number
    bytes: number
  }
  insights: {
    conversations: number
    nuggets: number
  }
}

export type InsightNugget = {
  category: string
  title: string
  content: string
  people?: string[]
  date?: string
  importance?: number
  conv?: string
  convId?: string
  isGroup?: boolean
}

export type InsightSummary = {
  convId: string
  name: string
  isGroup?: boolean
  summary: string
  topics?: string[]
  keyPeople?: string[]
}

export type InsightsResponse = {
  convCount: number
  nuggetCount: number
  byCategory: Record<string, InsightNugget[]>
  summaries: InsightSummary[]
  boards: Record<string, string>
}
