import type {
  BinaryTextIndex,
  ChatClueDossier,
  ChatExportIndex,
  CompletionAudit,
  CourseItem,
  DatabaseAnalysis,
  DeepFileIndex,
  LibraryManifest,
  LogTextIndex,
  SourceDiscovery,
  SourceTextIndex,
  TextExtract,
} from '../../shared/contracts/index.js'

export type ExtractionBoundary = {
  generatedAt: string
  localFacts: Array<{ title: string; detail: string; evidence: string[] }>
  webFindings: Array<{ title: string; detail: string; url: string }>
  decisions: string[]
}

export type DownloadStat = { ext: string; count: number; bytes: number }
export type DownloadNameStat = { name: string; count: number; bytes: number }

export type PriorityChatDatabase = {
  path: string
  exists: boolean
  size: number
  readable: boolean
  detail: string
}

export type SummaryData = {
  manifest: LibraryManifest
  discovery: SourceDiscovery
  deepIndex: DeepFileIndex
  databaseAnalysis: DatabaseAnalysis
  binaryTextIndex: BinaryTextIndex
  logTextIndex: LogTextIndex
  chatExportIndex: ChatExportIndex
  chatClueDossier: ChatClueDossier
  sourceTextIndex: SourceTextIndex
  completionAudit: CompletionAudit
  extractionBoundary: ExtractionBoundary
  courseData: { coursePlan: CourseItem[] }
}

export type SummaryContext = SummaryData & {
  textExtracts: TextExtract[]
  byCategory: Record<string, number>
  byApp: Record<string, number>
  byPreview: Record<string, number>
  bySourcePreview: Record<string, number>
  downloadByExt: DownloadStat[]
  downloadByName: DownloadNameStat[]
  forecast: CourseItem[]
  blockedDbs: SourceDiscovery['databases']
  highSignalBinarySnippets: BinaryTextIndex['snippets']
  valuableTextExtracts: TextExtract[]
  chatExportCandidates: ChatExportIndex['candidateFiles']
  acceptedChatExportCandidates: ChatExportIndex['candidateFiles']
  uniquePriorityChatDatabases: PriorityChatDatabase[]
  textEvidence: string
  chatExportSignalText: string
  chatExportConversationText: string
  chatExportCandidateText: string
  chatClueSourceTypeText: string
  chatClueAppText: string
  chatClueSignalText: string
  chatClueGroupText: string
  sourceTextSignalText: string
  sourceTextPreviewText: string
  sourceTextExtractText: string
  sourceTextChatLikeText: string
  logSignalText: string
  logSnippetText: string
  coverageRootText: string
  coverageDirectoryText: string
  coverageWideMatchText: string
  coverageDatabaseText: string
  coverageConclusionText: string
  auditItemText: string
}
