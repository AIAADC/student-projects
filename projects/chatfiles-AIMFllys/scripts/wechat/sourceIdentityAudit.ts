import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { listMessageTables, loadMessageName2Id, readSourceMessages, type SourceMessage } from './sourceReader.js'
import { compareSourceRow, groupKey } from './sourceIdentityAuditComparison.js'
import {
  columnNames,
  isSinglePathSegment,
  loadSnapshotDisplayNames,
  outputConversations,
  outputMessages,
  requiredConversationColumns,
  requiredMessageColumns,
  sourceMessageTable,
} from './sourceIdentityAuditDatabase.js'
import {
  addIssue,
  countReplacementCharacters,
  emptyMetrics,
  evidence,
  fieldSample,
  finalIssues,
} from './sourceIdentityAuditIssues.js'
import type {
  MutableIssue,
  OutputMessageWithRawType,
  SourceIdentityAuditResult,
  SourceShard,
} from './sourceIdentityAuditTypes.js'

export type { SourceIdentityAuditIssue, SourceIdentityAuditResult } from './sourceIdentityAuditTypes.js'
export function auditSourceIdentity(outputDbPath: string, sourceRoot: string): SourceIdentityAuditResult {
  if (!fs.existsSync(outputDbPath)) throw new Error(`WeChat database not found: ${outputDbPath}`)
  if (!fs.existsSync(sourceRoot)) throw new Error(`Decrypted WeChat root not found: ${sourceRoot}`)

  const issues = new Map<string, MutableIssue>()
  const metrics = emptyMetrics()
  const resolvedSourceRoot = path.resolve(sourceRoot)
  const output = new DatabaseSync(outputDbPath, { readOnly: true })
  const shards = new Map<string, SourceShard>()
  const displayNamesBySnapshot = new Map<string, ReadonlyMap<string, string>>()
  const sourceTablesByUsername = new Map<string, string>()
  try {
    const conversationColumns = columnNames(output, 'conversations')
    const messageColumns = columnNames(output, 'messages')
    const missingColumns = [
      ...requiredConversationColumns
        .filter((column) => !conversationColumns.has(column))
        .map((column) => `conversations.${column}`),
      ...requiredMessageColumns
        .filter((column) => !messageColumns.has(column))
        .map((column) => `messages.${column}`),
    ]
    if (missingColumns.length > 0) {
      addIssue(
        issues,
        'source-output-schema-missing-column',
        missingColumns.length,
        missingColumns.join(', '),
      )
      return { ok: false, metrics, issues: finalIssues(issues) }
    }

    for (const conversation of outputConversations(output)) {
      metrics.outputConversations++
      const replacementCharacters = countReplacementCharacters(conversation.display)
      metrics.outputReplacementCharacters += replacementCharacters
      if (conversation.id !== `wx:${conversation.owner}:${conversation.username}`) {
        addIssue(issues, 'source-conversation-id-mismatch', 1)
      }
      if (!isSinglePathSegment(conversation.sourceSnapshot)) {
        addIssue(
          issues,
          'source-path-invalid',
          1,
          `${conversation.sourceSnapshot}/${conversation.id}`,
        )
        continue
      }

      let displayNames = displayNamesBySnapshot.get(conversation.sourceSnapshot)
      if (!displayNames) {
        try {
          displayNames = loadSnapshotDisplayNames(
            path.join(resolvedSourceRoot, conversation.sourceSnapshot),
          )
          displayNamesBySnapshot.set(conversation.sourceSnapshot, displayNames)
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          addIssue(
            issues,
            'source-contact-unreadable',
            1,
            `${conversation.sourceSnapshot}/${conversation.id} ${reason}`,
          )
          continue
        }
      }

      const sourceDisplay = displayNames.get(conversation.username) ?? conversation.username
      if (conversation.display !== sourceDisplay) {
        addIssue(
          issues,
          'source-conversation-display-mismatch',
          1,
          `${conversation.sourceSnapshot}/${conversation.id} output=${conversation.display} source=${sourceDisplay}`,
        )
      } else {
        metrics.matchedConversationDisplays++
        metrics.sourceVerifiedReplacementCharacters += replacementCharacters
      }
    }

    let currentKey = ''
    let group: OutputMessageWithRawType[] = []
    const auditGroup = (messages: readonly OutputMessageWithRawType[]) => {
      if (messages.length === 0) return
      const first = messages[0]
      metrics.sourceTables++

      for (const message of messages) {
        if (!message.owner && !message.peer) {
          addIssue(issues, 'source-conversation-missing', 1, evidence(message))
        }
        if (message.conversationSnapshot !== message.sourceSnapshot) {
          addIssue(
            issues,
            'source-conversation-snapshot-mismatch',
            1,
            fieldSample(message, message.conversationSnapshot, message.sourceSnapshot),
          )
        }
        let expectedSourceTable = sourceTablesByUsername.get(message.peer)
        if (!expectedSourceTable) {
          expectedSourceTable = sourceMessageTable(message.peer)
          sourceTablesByUsername.set(message.peer, expectedSourceTable)
        }
        if (message.sourceTable !== expectedSourceTable) {
          addIssue(issues, 'source-message-table-mismatch', 1)
        }
      }

      if (!isSinglePathSegment(first.sourceSnapshot) || !isSinglePathSegment(first.sourceDb)) {
        addIssue(issues, 'source-path-invalid', messages.length, evidence(first))
        return
      }

      const shardKey = `${first.sourceSnapshot}\u0000${first.sourceDb}`
      let shard = shards.get(shardKey)
      if (!shard) {
        const sourcePath = path.resolve(
          resolvedSourceRoot,
          first.sourceSnapshot,
          'db_storage',
          'message',
          first.sourceDb,
        )
        const relative = path.relative(resolvedSourceRoot, sourcePath)
        if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
          addIssue(issues, 'source-path-invalid', messages.length, evidence(first))
          return
        }
        if (!fs.existsSync(sourcePath)) {
          addIssue(issues, 'source-shard-missing', messages.length, sourcePath)
          return
        }
        try {
          let displayNames = displayNamesBySnapshot.get(first.sourceSnapshot)
          if (!displayNames) {
            displayNames = loadSnapshotDisplayNames(path.join(resolvedSourceRoot, first.sourceSnapshot))
            displayNamesBySnapshot.set(first.sourceSnapshot, displayNames)
          }
          const db = new DatabaseSync(sourcePath, { readOnly: true })
          try {
            shard = {
              db,
              tables: listMessageTables(db),
              idToName: loadMessageName2Id(db),
              displayNames,
            }
          } catch (error) {
            db.close()
            throw error
          }
          shards.set(shardKey, shard)
          metrics.sourceShards++
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error)
          addIssue(issues, 'source-shard-unreadable', messages.length, `${sourcePath}: ${reason}`)
          return
        }
      }

      if (!shard.tables.has(first.sourceTable)) {
        addIssue(issues, 'source-table-missing', messages.length, evidence(first))
        return
      }

      let sourceRows: SourceMessage[]
      try {
        sourceRows = readSourceMessages(shard.db, first.sourceTable, shard.tables)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        addIssue(issues, 'source-table-unreadable', messages.length, `${evidence(first)} ${reason}`)
        return
      }
      metrics.sourceRowsScanned += sourceRows.length
      const rowsByLocalId = new Map<number, SourceMessage[]>()
      for (const row of sourceRows) {
        const rows = rowsByLocalId.get(row.localId) ?? []
        rows.push(row)
        rowsByLocalId.set(row.localId, rows)
      }

      for (const message of messages) {
        const matches = rowsByLocalId.get(message.localId) ?? []
        if (matches.length === 0) {
          addIssue(issues, 'source-row-missing', 1, evidence(message))
          continue
        }
        if (matches.length > 1) {
          addIssue(issues, 'source-row-ambiguous', 1, evidence(message))
          continue
        }
        metrics.matchedMessages++
        compareSourceRow(message, matches[0], shard, issues, metrics)
      }
    }

    for (const message of outputMessages(output)) {
      metrics.outputMessages++
      metrics.outputReplacementCharacters += countReplacementCharacters(message.text)
        + countReplacementCharacters(message.senderName)
      const key = groupKey(message)
      if (currentKey && key !== currentKey) {
        auditGroup(group)
        group = []
      }
      currentKey = key
      group.push(message)
    }
    auditGroup(group)

    const completedIssues = finalIssues(issues)
    return { ok: completedIssues.length === 0, metrics, issues: completedIssues }
  } finally {
    for (const shard of shards.values()) shard.db.close()
    output.close()
  }
}
