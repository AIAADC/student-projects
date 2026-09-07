import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  distillInsightMessages,
  renderInsightBoard,
  type InsightBoardRecord,
  type InsightConversation,
  type InsightState,
} from './insightRefresh.js'
import {
  allowedCategories,
  assertDataRoles,
  assertDatabaseFingerprint,
  assertRunId,
  readJson,
  resolvePaths,
  writeJson,
  type DeltaEntry,
  type RefreshOptions,
} from './insightRefreshContext.js'
import {
  copyDirectoryExclusive,
  insightArchiveTimeZone,
  insightFilename,
  loadInsightConversations,
  queryMessages,
} from './insightRefreshData.js'

export function distillInsightRefresh(options: RefreshOptions) {
  assertRunId(options.runId)
  const paths = resolvePaths(options)
  assertDataRoles(paths, 'candidate')
  const receiptPath = path.join(paths.bundleDir, 'receipt.json')
  const receipt = readJson<Record<string, unknown> & {
    database?: { sha256: string; size: number }
  }>(receiptPath)
  if (receipt.runId !== options.runId) throw new Error('Insight bundle run id does not match')
  if (!receipt.database) throw new Error('Insight bundle is missing a database fingerprint')
  assertDatabaseFingerprint(receipt.database, paths.databasePath)
  const distillStagingDir = path.join(
    path.dirname(paths.bundleDir),
    `.${path.basename(paths.bundleDir)}.${options.runId}.${process.pid}.distill.staging`,
  )
  const preparedBackupDir = path.join(path.dirname(paths.bundleDir), `insights.prepared.${options.runId}`)
  if (fs.existsSync(distillStagingDir)) throw new Error(`Distill staging directory already exists: ${distillStagingDir}`)
  if (fs.existsSync(preparedBackupDir)) throw new Error(`Prepared insight backup already exists: ${preparedBackupDir}`)
  copyDirectoryExclusive(paths.bundleDir, distillStagingDir)
  const stagingReceiptPath = path.join(distillStagingDir, 'receipt.json')
  const delta = readJson<DeltaEntry[]>(path.join(distillStagingDir, '_delta.json'))
  const states = readJson<InsightState[]>(path.join(distillStagingDir, '_state.json'))
  const stateById = new Map(states.map((state) => [state.convId, state]))
  const db = new DatabaseSync(paths.databasePath, { readOnly: true })
  let addedNuggets = 0
  let inputRows = 0
  let eligibleRows = 0
  let selectedRows = 0
  try {
    const timeZone = insightArchiveTimeZone(db)
    for (const entry of delta) {
      const file = path.join(distillStagingDir, 'conv', insightFilename(entry.conversation.id))
      const existing = fs.existsSync(file) ? readJson<InsightConversation>(file) : undefined
      if (entry.kind === 'grown' && !existing) {
        throw new Error(`Grown insight conversation is missing: ${entry.conversation.id}`)
      }
      const messages = queryMessages(db, entry)
      const expectedGrowth = entry.conversation.textCount - entry.previousTextCount
      if (messages.length !== expectedGrowth) {
        throw new Error(`Conversation text growth does not close during distillation: ${entry.conversation.id}`)
      }
      const distilled = distillInsightMessages({
        conversation: entry.conversation,
        kind: entry.kind,
        existing,
        messages,
        timeZone,
      })
      writeJson(file, distilled.conversation)
      addedNuggets += distilled.addedNuggets
      inputRows += distilled.metrics.inputRows
      eligibleRows += distilled.metrics.eligibleRows
      selectedRows += distilled.metrics.selectedRows
      const lastMessage = messages.at(-1)!
      stateById.set(entry.conversation.id, {
        convId: entry.conversation.id,
        analyzedTextCount: entry.conversation.textCount,
        analyzedLastTime: lastMessage.time,
        analyzedLastMessageUid: lastMessage.messageUid,
        analyzedLastSequence: lastMessage.canonicalSequence,
        analyzedAt: new Date().toISOString(),
      })
    }
  } finally {
    db.close()
  }
  const nextStates = [...stateById.values()].sort((a, b) => a.convId.localeCompare(b.convId))
  writeJson(path.join(distillStagingDir, '_state.json'), nextStates)
  writeJson(stagingReceiptPath, {
    ...receipt,
    status: 'complete',
    completedAt: new Date().toISOString(),
    distillation: {
      processed: delta.length,
      inputRows,
      eligibleRows,
      selectedRows,
      addedNuggets,
      states: nextStates.length,
    },
  })
  fs.renameSync(paths.bundleDir, preparedBackupDir)
  try {
    fs.renameSync(distillStagingDir, paths.bundleDir)
  } catch (error) {
    fs.renameSync(preparedBackupDir, paths.bundleDir)
    throw new Error('Distilled insight publication failed and the prepared bundle was restored', { cause: error })
  }
  return {
    processed: delta.length,
    inputRows,
    eligibleRows,
    selectedRows,
    addedNuggets,
    states: nextStates.length,
    preparedBackupDir,
  }
}

export function rebuildInsightBoards(options: RefreshOptions) {
  assertRunId(options.runId)
  const paths = resolvePaths(options)
  assertDataRoles(paths, 'candidate')
  const receiptPath = path.join(paths.bundleDir, 'receipt.json')
  const receipt = readJson<Record<string, unknown> & {
    database?: { sha256: string; size: number }
  }>(receiptPath)
  if (receipt.runId !== options.runId) throw new Error('Insight bundle run id does not match')
  if (receipt.status !== 'complete') throw new Error('Insight distillation must complete before boards are rebuilt')
  if (!receipt.database) throw new Error('Insight bundle is missing a database fingerprint')
  assertDatabaseFingerprint(receipt.database, paths.databasePath)
  const insights = loadInsightConversations(path.join(paths.bundleDir, 'conv'))
  const byCategory = new Map<string, InsightBoardRecord[]>()
  for (const conversation of insights) {
    for (const nugget of conversation.nuggets ?? []) {
      if (!allowedCategories.has(nugget.category)) {
        throw new Error(`Cannot build a board for invalid category: ${nugget.category}`)
      }
      const records = byCategory.get(nugget.category) ?? []
      records.push({
        convId: conversation.convId,
        conversationName: conversation.name,
        nugget,
      })
      byCategory.set(nugget.category, records)
    }
  }
  const boardsDir = path.join(paths.bundleDir, 'boards')
  const boardsStagingDir = path.join(paths.bundleDir, `.boards.${options.runId}.${process.pid}.staging`)
  const previousBoardsDir = path.join(paths.bundleDir, `boards.pre-refresh.${options.runId}`)
  if (!fs.existsSync(boardsDir)) throw new Error('Prepared insight boards are missing')
  if (fs.existsSync(boardsStagingDir)) throw new Error(`Board staging directory already exists: ${boardsStagingDir}`)
  if (fs.existsSync(previousBoardsDir)) throw new Error(`Previous boards directory already exists: ${previousBoardsDir}`)
  fs.mkdirSync(boardsStagingDir)
  for (const [category, records] of [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))) {
    fs.writeFileSync(
      path.join(boardsStagingDir, `${category}.md`),
      renderInsightBoard(category, records),
      { encoding: 'utf8', flag: 'wx' },
    )
  }
  fs.renameSync(boardsDir, previousBoardsDir)
  try {
    fs.renameSync(boardsStagingDir, boardsDir)
  } catch (error) {
    fs.renameSync(previousBoardsDir, boardsDir)
    throw new Error('Board publication failed and the previous boards were restored', { cause: error })
  }
  const nuggets = [...byCategory.values()].reduce((sum, records) => sum + records.length, 0)
  writeJson(receiptPath, {
    ...receipt,
    boardBuild: {
      status: 'complete',
      generatedAt: new Date().toISOString(),
      boards: byCategory.size,
      nuggets,
    },
  })
  return { boards: byCategory.size, nuggets }
}
