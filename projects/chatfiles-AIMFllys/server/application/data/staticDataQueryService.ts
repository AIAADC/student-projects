import path from 'node:path'

import type {
  ChatClueDossier,
  ChatSynthesis,
  DatabaseAnalysis,
  ValueCandidateIndex,
} from '../../../shared/contracts/index.js'
import {
  chatClueDossierSchema,
  chatSummarySchema,
  chatSynthesisSchema,
  databaseAnalysisSchema,
  knowledgeBaseSchema,
  valueCandidateIndexSchema,
} from '../../../shared/contracts/index.js'
import { library, readJson, sourceLibrary } from '../../utils/helpers.js'

export type StaticDataQueryService = {
  library: () => unknown
  sourceLibrary: () => unknown
  knowledge: () => unknown
  summary: () => unknown
  chatClues: () => unknown
  chatSynthesis: () => unknown
  databaseAnalysis: () => unknown
  valueCandidates: () => unknown
}

const epoch = () => new Date(0).toISOString()

export function createRuntimeStaticDataQueryService(projectRoot: string): StaticDataQueryService {
  return {
    library: () => library(projectRoot),
    sourceLibrary: () => sourceLibrary(projectRoot),
    knowledge: () => knowledgeBaseSchema.parse(readJson(path.join(projectRoot, 'data', 'knowledge.json'), {
      generatedAt: epoch(), sourceStatus: [], coursePlan: [], sections: [],
    })),
    summary: () => chatSummarySchema.parse(readJson(path.join(projectRoot, 'data', 'summary.json'), {
      generatedAt: epoch(),
      coverage: {
        archivedFiles: 0, archivedBytes: 0, sourceRoots: 0, directoryCount: 0,
        databaseCandidates: 0, readableDatabases: 0, textExtracts: 0,
      },
      boards: [], textExtracts: [],
    })),
    chatClues: () => chatClueDossierSchema.parse(readJson<ChatClueDossier>(path.join(projectRoot, 'data', 'chat-clue-dossier.json'), {
      generatedAt: epoch(),
      totals: {
        groups: 0, snippets: 0, highValueGroups: 0, chatExportMessages: 0,
        bySourceType: {}, bySourceApp: {}, bySignal: {},
      },
      groups: [],
    })),
    chatSynthesis: () => chatSynthesisSchema.parse(readJson<ChatSynthesis>(path.join(projectRoot, 'data', 'chat-synthesis.json'), {
      generatedAt: epoch(),
      totals: {
        groups: 0, snippets: 0, highValueGroups: 0, confirmedConversations: 0,
        sourceOnlyGroups: 0, technicalGroups: 0, academicGroups: 0, philosophyGroups: 0,
      },
      sections: [],
    })),
    databaseAnalysis: () => databaseAnalysisSchema.parse(readJson<DatabaseAnalysis>(path.join(projectRoot, 'data', 'database-analysis.json'), {
      generatedAt: epoch(),
      totals: {
        readableDatabases: 0, unreadableDatabases: 0, analyzedTables: 0,
        suspectedMessageTables: 0, textSamples: 0,
      },
      databases: [],
    })),
    valueCandidates: () => valueCandidateIndexSchema.parse(readJson<ValueCandidateIndex>(path.join(projectRoot, 'data', 'value-candidates.json'), {
      generatedAt: epoch(),
      totals: {
        sourceFiles: 0, archivedFiles: 0, unarchivedFiles: 0, representedByArchive: 0,
        duplicateCandidatesSkipped: 0, candidates: 0, high: 0, medium: 0, low: 0,
      },
      byBucket: {}, byPreview: {}, candidates: [],
    })),
  }
}
