import type { ChatAuditResult } from './chatAudit.js'
import type { SourceIdentityAuditResult } from './sourceIdentityAudit.js'

export type ReplacementCharacterReconciliation = {
  databaseRows: number
  outputCharacters: number
  sourceVerifiedCharacters: number
  reconciled: boolean
}

export function reconcileChatAudits(
  database: ChatAuditResult,
  source?: SourceIdentityAuditResult,
) {
  const replacementIssue = database.issues.find((issue) => issue.code === 'replacement-character')
  const databaseRows = replacementIssue?.count ?? 0
  const outputCharacters = source?.metrics.outputReplacementCharacters ?? 0
  const sourceVerifiedCharacters = source?.metrics.sourceVerifiedReplacementCharacters ?? 0
  const reconciled = databaseRows === 0
    ? outputCharacters === 0
    : source !== undefined
      && outputCharacters > 0
      && outputCharacters === sourceVerifiedCharacters
  const blockingDatabaseIssues = database.issues.filter(
    (issue) => issue.code !== 'replacement-character',
  )

  return {
    ok: blockingDatabaseIssues.length === 0 && (source?.ok ?? true) && reconciled,
    replacementCharacterReconciliation: {
      databaseRows,
      outputCharacters,
      sourceVerifiedCharacters,
      reconciled,
    } satisfies ReplacementCharacterReconciliation,
  }
}
