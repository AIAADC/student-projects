import type { ChatSummary } from '../../shared/contracts/index.js'
import { buildChatBoards } from './boardSections/chat.js'
import { buildCoverageBoards } from './boardSections/coverage.js'
import { buildMiscBoards } from './boardSections/misc.js'
import { buildOverviewBoards } from './boardSections/overview.js'
import type { SummaryContext } from './types.js'

export function buildBoards(ctx: SummaryContext): ChatSummary['boards'] {
  return [
    ...buildOverviewBoards(ctx),
    ...buildChatBoards(ctx),
    ...buildCoverageBoards(ctx),
    ...buildMiscBoards(ctx),
  ]
}

export function buildCoverage(ctx: SummaryContext): ChatSummary['coverage'] {
  const {
    manifest,
    discovery,
    deepIndex,
    databaseAnalysis,
    binaryTextIndex,
    chatExportIndex,
    sourceTextIndex,
    logTextIndex,
    chatClueDossier,
    completionAudit,
    textExtracts,
  } = ctx

  return {
    archivedFiles: manifest.stats.archived,
    archivedBytes: manifest.stats.bytes,
    sourceRoots: discovery.roots.filter((item) => item.exists).length,
    directoryCount: discovery.directoryMap.filter((item) => item.exists).length,
    databaseCandidates: deepIndex.totals.databaseCandidates || discovery.databases.filter((item) => item.exists).length,
    readableDatabases: deepIndex.databaseCandidates.filter((item) => item.readable).length || discovery.databases.filter((item) => item.readable).length,
    textExtracts: textExtracts.length,
    totalFilesSeen: deepIndex.totals.files,
    totalBytesSeen: deepIndex.totals.bytes,
    databaseTables: databaseAnalysis.totals.analyzedTables,
    suspectedMessageTables: databaseAnalysis.totals.suspectedMessageTables,
    databaseTextSamples: databaseAnalysis.totals.textSamples,
    binaryTextSnippets: binaryTextIndex.candidateSnippets,
    binaryScannedFiles: binaryTextIndex.scannedFiles,
    chatExportSources: chatExportIndex.totals.sources,
    chatExportMessages: chatExportIndex.totals.messages,
    chatExportParticipants: chatExportIndex.totals.participants,
    sourceTextFiles: sourceTextIndex.readableFiles,
    sourceTextExtracts: sourceTextIndex.extracts.length,
    sourceTextChatLike: sourceTextIndex.chatLikeFiles,
    logTextFiles: logTextIndex.scannedFiles,
    logTextSnippets: logTextIndex.candidateSnippets,
    logTextHighConfidence: logTextIndex.highConfidenceChatSnippets,
    chatClueGroups: chatClueDossier.totals.groups,
    chatClueHighValue: chatClueDossier.totals.highValueGroups,
    auditProved: completionAudit.totals.proved,
    auditPartial: completionAudit.totals.partial,
    auditNeedsInput: completionAudit.totals.needsInput,
  }
}
