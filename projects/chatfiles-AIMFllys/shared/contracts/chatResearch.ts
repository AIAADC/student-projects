import type { LibraryFile } from './files.js'

export type SummaryInsight = {
  id: string
  title: string
  scope: string
  priority: 'high' | 'medium' | 'low'
  tags: string[]
  content: string
  evidence: string[]
}

export type TextExtract = {
  id: string
  title: string
  sourcePath: string
  archivePath?: string
  sourceApp: LibraryFile['sourceApp']
  chars: number
  signals: string[]
  excerpt: string
}

export type ChatSummary = {
  generatedAt: string
  coverage: {
    archivedFiles: number
    archivedBytes: number
    sourceRoots: number
    directoryCount: number
    databaseCandidates: number
    readableDatabases: number
    textExtracts: number
    totalFilesSeen?: number
    totalBytesSeen?: number
    databaseTables?: number
    suspectedMessageTables?: number
    databaseTextSamples?: number
    binaryTextSnippets?: number
    binaryScannedFiles?: number
    chatExportSources?: number
    chatExportMessages?: number
    chatExportParticipants?: number
    sourceTextFiles?: number
    sourceTextExtracts?: number
    sourceTextChatLike?: number
    logTextFiles?: number
    logTextSnippets?: number
    logTextHighConfidence?: number
    chatClueGroups?: number
    chatClueHighValue?: number
    auditProved?: number
    auditPartial?: number
    auditNeedsInput?: number
  }
  boards: SummaryInsight[]
  textExtracts: TextExtract[]
}

export type CompletionAuditItem = {
  id: string
  title: string
  status: 'proved' | 'partial' | 'needs_input' | 'not_proved'
  detail: string
  evidence: string[]
  next: string
}

export type CompletionAudit = {
  generatedAt: string
  totals: {
    proved: number
    partial: number
    needsInput: number
    notProved: number
  }
  items: CompletionAuditItem[]
}

export type SourceTextExtract = {
  id: string
  path: string
  sourceApp: LibraryFile['sourceApp']
  ext: string
  preview?: LibraryFile['preview']
  size: number
  modified: string
  chars: number
  signals: string[]
  quality: 'high' | 'medium' | 'low'
  excerpt: string
}

export type SourceTextIndex = {
  generatedAt: string
  scannedFiles: number
  readableFiles: number
  skippedFiles: number
  totalChars: number
  chatLikeFiles: number
  signalCounts: Record<string, number>
  previewCounts?: Record<string, number>
  extracts: SourceTextExtract[]
}

export type ChatExportMessage = {
  id: string
  sourcePath: string
  conversation: string
  sender: string
  timestamp?: string
  content: string
  signals: string[]
}

export type ChatExportConversation = {
  id: string
  title: string
  sourcePaths: string[]
  participants: string[]
  messageCount: number
  signalCounts: Record<string, number>
  highlights: ChatExportMessage[]
}

export type ChatExportIndex = {
  generatedAt: string
  importDir: string
  searchedRoots: string[]
  candidateFiles: Array<{
    path: string
    size: number
    modified: string
    parsedMessages: number
    accepted: boolean
    reason: string
  }>
  totals: {
    sources: number
    conversations: number
    messages: number
    participants: number
    highlights: number
  }
  conversations: ChatExportConversation[]
}

export type ChatClueGroup = {
  id: string
  sourceType: '聊天导出' | '数据库/索引片段' | '日志/缓存片段' | '可读源文本'
  sourceApp: LibraryFile['sourceApp']
  path: string
  score: number
  value: 'high' | 'medium' | 'low'
  signals: string[]
  snippetCount: number
  verdict: string
  next: string
  excerpts: string[]
}

export type ChatClueDossier = {
  generatedAt: string
  totals: {
    groups: number
    snippets: number
    highValueGroups: number
    chatExportMessages: number
    bySourceType: Record<string, number>
    bySourceApp: Record<string, number>
    bySignal: Record<string, number>
  }
  groups: ChatClueGroup[]
}

export type ChatSynthesisItem = {
  id: string
  title: string
  scope: string
  value: 'high' | 'medium' | 'low'
  sourceType: ChatClueGroup['sourceType']
  sourceApp: LibraryFile['sourceApp']
  signals: string[]
  summary: string
  next: string
  evidencePath: string
  excerpts: string[]
}

export type ChatSynthesisSection = {
  id: string
  title: string
  intent: string
  items: ChatSynthesisItem[]
}

export type ChatSynthesis = {
  generatedAt: string
  totals: {
    groups: number
    snippets: number
    highValueGroups: number
    confirmedConversations: number
    sourceOnlyGroups: number
    technicalGroups: number
    academicGroups: number
    philosophyGroups: number
  }
  sections: ChatSynthesisSection[]
}

export type BinaryTextSnippet = {
  path: string
  encoding: 'utf8' | 'utf16le'
  offset: number
  chars: number
  preview: string
  signals: string[]
}

export type BinaryTextIndex = {
  generatedAt: string
  scannedFiles: number
  scannedBytes: number
  candidateSnippets: number
  files: Array<{
    path: string
    size: number
    readableDatabase: boolean
    snippets: number
    signals: string[]
  }>
  snippets: BinaryTextSnippet[]
}

export type LogTextIndex = {
  generatedAt: string
  scannedFiles: number
  scannedBytes: number
  candidateFiles: number
  candidateSnippets: number
  highConfidenceChatSnippets: number
  files: Array<{
    path: string
    size: number
    modified: string
    ext: string
    sourceApp: LibraryFile['sourceApp']
    snippets: number
    signals: string[]
  }>
  snippets: BinaryTextSnippet[]
}
