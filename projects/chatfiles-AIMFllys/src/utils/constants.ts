import type {
  ChatClueDossier,
  ChatSummary,
  ChatSynthesis,
  DatabaseAnalysis,
  InsightsResponse,
  KnowledgeBase,
  LibraryManifest,
  Overview,
  SourceFileManifest,
  ValueCandidateIndex,
} from '../types'

export const emptyManifest: LibraryManifest = {
  generatedAt: '',
  roots: [],
  files: [],
  stats: { discovered: 0, archived: 0, duplicatesSkipped: 0, bytes: 0 },
}

export const emptyKnowledge: KnowledgeBase = {
  generatedAt: '',
  sourceStatus: [],
  coursePlan: [],
  sections: [],
}

export const emptySummary: ChatSummary = {
  generatedAt: '',
  coverage: {
    archivedFiles: 0,
    archivedBytes: 0,
    sourceRoots: 0,
    directoryCount: 0,
    databaseCandidates: 0,
    readableDatabases: 0,
    textExtracts: 0,
    chatExportSources: 0,
    chatExportMessages: 0,
    chatExportParticipants: 0,
    sourceTextFiles: 0,
    sourceTextExtracts: 0,
    sourceTextChatLike: 0,
    logTextFiles: 0,
    logTextSnippets: 0,
    logTextHighConfidence: 0,
    auditProved: 0,
    auditPartial: 0,
    auditNeedsInput: 0,
  },
  boards: [],
  textExtracts: [],
}

export const emptyClueDossier: ChatClueDossier = {
  generatedAt: '',
  totals: {
    groups: 0,
    snippets: 0,
    highValueGroups: 0,
    chatExportMessages: 0,
    bySourceType: {},
    bySourceApp: {},
    bySignal: {},
  },
  groups: [],
}

export const emptyChatSynthesis: ChatSynthesis = {
  generatedAt: '',
  totals: {
    groups: 0,
    snippets: 0,
    highValueGroups: 0,
    confirmedConversations: 0,
    sourceOnlyGroups: 0,
    technicalGroups: 0,
    academicGroups: 0,
    philosophyGroups: 0,
  },
  sections: [],
}

export const emptyDatabaseAnalysis: DatabaseAnalysis = {
  generatedAt: '',
  totals: {
    readableDatabases: 0,
    unreadableDatabases: 0,
    analyzedTables: 0,
    suspectedMessageTables: 0,
    textSamples: 0,
  },
  databases: [],
}

export const emptyValueCandidates: ValueCandidateIndex = {
  generatedAt: '',
  totals: {
    sourceFiles: 0,
    archivedFiles: 0,
    unarchivedFiles: 0,
    representedByArchive: 0,
    duplicateCandidatesSkipped: 0,
    candidates: 0,
    high: 0,
    medium: 0,
    low: 0,
  },
  byBucket: {},
  byPreview: {},
  candidates: [],
}

export const emptyOverview: Overview = {
  chat: { conversations: 0, messages: 0, textMessages: 0, contacts: 0 },
  files: { archived: 0, indexed: 0, bytes: 0 },
  insights: { conversations: 0, nuggets: 0 },
}

export const emptyInsights: InsightsResponse = {
  convCount: 0,
  nuggetCount: 0,
  byCategory: {},
  summaries: [],
  boards: {},
}

export const emptySourceManifest: SourceFileManifest = {
  generatedAt: '',
  roots: [],
  files: [],
  stats: {
    files: 0,
    bytes: 0,
    databaseCandidates: 0,
    mediaCandidates: 0,
    textCandidates: 0,
  },
}
