import path from 'node:path'
import type {
  BinaryTextIndex,
  ChatClueDossier,
  ChatExportIndex,
  CompletionAudit,
  DatabaseAnalysis,
  DeepFileIndex,
  LibraryManifest,
  LogTextIndex,
  SourceDiscovery,
  SourceTextIndex,
  TextExtract,
} from '../../shared/contracts/index.js'
import { dataDir, root } from '../shared.js'
import { readCurrentLibraryManifest } from '../data/catalogConsumer.js'
import { buildEvidenceTexts, readTextExtract } from './evidence.js'
import type { ExtractionBoundary, PriorityChatDatabase, SummaryContext, SummaryData } from './types.js'
import { countBy, formatMb, readJson } from './utils.js'

export function loadSummaryData(): SummaryData {
  return {
    manifest: readCurrentLibraryManifest(path.dirname(dataDir)) as LibraryManifest,
    discovery: readJson<SourceDiscovery>(path.join(dataDir, 'source-discovery.json'), {
      generatedAt: new Date(0).toISOString(),
      roots: [],
      directoryMap: [],
      databases: [],
      topCandidates: [],
    }),
    deepIndex: readJson<DeepFileIndex>(path.join(dataDir, 'deep-index.json'), {
      generatedAt: new Date(0).toISOString(),
      roots: [],
      totals: {
        files: 0,
        directories: 0,
        bytes: 0,
        databaseCandidates: 0,
        textCandidates: 0,
        mediaCandidates: 0,
        attachmentCandidates: 0,
      },
      extensionStats: [],
      databaseCandidates: [],
      largestFiles: [],
      newestFiles: [],
    }),
    databaseAnalysis: readJson<DatabaseAnalysis>(path.join(dataDir, 'database-analysis.json'), {
      generatedAt: new Date(0).toISOString(),
      totals: {
        readableDatabases: 0,
        unreadableDatabases: 0,
        analyzedTables: 0,
        suspectedMessageTables: 0,
        textSamples: 0,
      },
      databases: [],
    }),
    binaryTextIndex: readJson<BinaryTextIndex>(path.join(dataDir, 'binary-text-index.json'), {
      generatedAt: new Date(0).toISOString(),
      scannedFiles: 0,
      scannedBytes: 0,
      candidateSnippets: 0,
      files: [],
      snippets: [],
    }),
    logTextIndex: readJson<LogTextIndex>(path.join(dataDir, 'log-text-index.json'), {
      generatedAt: new Date(0).toISOString(),
      scannedFiles: 0,
      scannedBytes: 0,
      candidateFiles: 0,
      candidateSnippets: 0,
      highConfidenceChatSnippets: 0,
      files: [],
      snippets: [],
    }),
    chatExportIndex: readJson<ChatExportIndex>(path.join(dataDir, 'chat-export-index.json'), {
      generatedAt: new Date(0).toISOString(),
      importDir: path.join(root, 'imports', 'chat-exports'),
      searchedRoots: [],
      candidateFiles: [],
      totals: {
        sources: 0,
        conversations: 0,
        messages: 0,
        participants: 0,
        highlights: 0,
      },
      conversations: [],
    }),
    chatClueDossier: readJson<ChatClueDossier>(path.join(dataDir, 'chat-clue-dossier.json'), {
      generatedAt: new Date(0).toISOString(),
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
    }),
    sourceTextIndex: readJson<SourceTextIndex>(path.join(dataDir, 'source-text-index.json'), {
      generatedAt: new Date(0).toISOString(),
      scannedFiles: 0,
      readableFiles: 0,
      skippedFiles: 0,
      totalChars: 0,
      chatLikeFiles: 0,
      signalCounts: {},
      extracts: [],
    }),
    completionAudit: readJson<CompletionAudit>(path.join(dataDir, 'completion-audit.json'), {
      generatedAt: new Date(0).toISOString(),
      totals: {
        proved: 0,
        partial: 0,
        needsInput: 0,
        notProved: 0,
      },
      items: [],
    }),
    extractionBoundary: readJson<ExtractionBoundary>(path.join(dataDir, 'extraction-boundary.json'), {
      generatedAt: new Date(0).toISOString(),
      localFacts: [],
      webFindings: [],
      decisions: [],
    }),
    courseData: readJson<{ coursePlan: SummaryData['courseData']['coursePlan'] }>(path.join(dataDir, 'course-plan.json'), {
      coursePlan: [],
    }),
  }
}

function buildPriorityChatDatabases(data: SummaryData): PriorityChatDatabase[] {
  const priorityChatDatabases = [
    ...data.discovery.databases.map((item) => ({
      path: item.path,
      exists: item.exists,
      size: item.size,
      readable: item.readable,
      detail: item.detail,
    })),
    ...data.deepIndex.databaseCandidates
      .filter((item) => /nt_msg|group_msg|buddy_msg|files_in_chat|xwechat|wechat|message|msg|chat|fts|talk/i.test(item.path))
      .map((item) => ({
        path: item.path,
        exists: true,
        size: item.size,
        readable: item.readable,
        detail: item.detail,
      })),
  ]
  const seenPriorityDb = new Set<string>()
  return priorityChatDatabases.filter((item) => {
    const key = item.path.toLowerCase()
    if (seenPriorityDb.has(key)) return false
    seenPriorityDb.add(key)
    return true
  })
}

export function buildSummaryContext(): SummaryContext {
  const data = loadSummaryData()
  const { manifest, discovery, deepIndex } = data

  const textExtracts = manifest.files.map(readTextExtract).filter(Boolean) as TextExtract[]
  const byCategory = countBy(manifest.files.map((file) => file.category))
  const byApp = countBy(manifest.files.map((file) => file.sourceApp))
  const byPreview = countBy(manifest.files.map((file) => file.preview))
  const bySourcePreview = countBy((deepIndex.files ?? []).map((file) => file.preview))
  const downloadFiles = (deepIndex.files ?? []).filter((file) => file.preview === 'download')
  const downloadByExt = Object.entries(countBy(downloadFiles.map((file) => file.ext || '[无扩展名]')))
    .map(([ext, count]) => ({
      ext,
      count,
      bytes: downloadFiles.filter((file) => (file.ext || '[无扩展名]') === ext).reduce((sum, file) => sum + file.size, 0),
    }))
    .sort((a, b) => b.count - a.count || b.bytes - a.bytes)
  const downloadByName = Object.entries(countBy(downloadFiles.map((file) => path.basename(file.path).toLowerCase())))
    .map(([name, count]) => ({
      name,
      count,
      bytes: downloadFiles.filter((file) => path.basename(file.path).toLowerCase() === name).reduce((sum, file) => sum + file.size, 0),
    }))
    .sort((a, b) => b.count - a.count || b.bytes - a.bytes)
  const forecast = data.courseData.coursePlan.filter((course) => course.kind === 'forecast')
  const blockedDbs = discovery.databases.filter((item) => item.exists && !item.readable)
  const highSignalBinarySnippets = data.binaryTextIndex.snippets.filter(
    (item) =>
      item.signals.includes('聊天线索') &&
      /[\u4e00-\u9fff]/.test(item.preview) &&
      !/CREATE TABLE|hookWx|GetWechatInfo|message_loop|messagecenter|errmsg|errcode|beacon|log_version/i.test(item.preview),
  )
  const valuableTextExtracts = textExtracts.filter((item) => !item.signals.includes('低价值文本'))
  const uniquePriorityChatDatabases = buildPriorityChatDatabases(data)
  const coverageDatabaseText =
    uniquePriorityChatDatabases
      .slice(0, 40)
      .map((item) => `| ${item.exists ? '存在' : '缺失'} | ${item.readable ? 'SQLite 可读' : '不可直接读'} | ${formatMb(item.size)} | ${item.path} | ${item.detail.replace(/\|/g, '/').slice(0, 180)} |`)
      .join('\n') || '| - | - | - | - | - |'

  const evidence = buildEvidenceTexts(data, textExtracts)
  const acceptedChatExportCandidates = evidence.chatExportCandidates.filter((item) => item.accepted)

  return {
    ...data,
    textExtracts,
    byCategory,
    byApp,
    byPreview,
    bySourcePreview,
    downloadByExt,
    downloadByName,
    forecast,
    blockedDbs,
    highSignalBinarySnippets,
    valuableTextExtracts,
    acceptedChatExportCandidates,
    uniquePriorityChatDatabases,
    coverageDatabaseText,
    ...evidence,
  }
}
