import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  insightNuggetEvidenceKey,
  type CurrentInsightConversation,
  type InsightConversation,
  type InsightState,
} from './insightRefresh.js'
import {
  allowedCategories,
  assertDataRoles,
  assertDatabaseFingerprint,
  readJson,
  readUtf8,
  resolvePaths,
  sha256Text,
  type AuditOptions,
} from './insightRefreshContext.js'
import { currentConversations, insightFilename } from './insightRefreshData.js'

function setDifference(left: Set<string>, right: Set<string>) {
  return [...left].filter((value) => !right.has(value))
}

export function auditInsightRefresh(options: AuditOptions) {
  const paths = resolvePaths(options)
  assertDataRoles(paths, 'audit')
  const issues: string[] = []
  const db = new DatabaseSync(paths.databasePath, { readOnly: true })
  let current: CurrentInsightConversation[]
  try {
    current = currentConversations(db)
  } finally {
    db.close()
  }
  const manifest = readJson<Array<{ convId: string; name: string; isGroup: boolean; textCount: number }>>(
    path.join(paths.bundleDir, '_manifest.json'),
  )
  const states = readJson<InsightState[]>(path.join(paths.bundleDir, '_state.json'))
  const receipt = readJson<{
    status?: string
    database?: { sha256: string; size: number }
    boardBuild?: { status?: string; boards?: number; nuggets?: number }
    deltaEvidence?: { conversations?: number; queriedRows?: number; textGrowth?: number }
    distillation?: {
      processed?: number
      inputRows?: number
      eligibleRows?: number
      selectedRows?: number
      addedNuggets?: number
    }
    baselineEvidence?: Array<{
      convId: string
      nuggetHashes: string[]
      summaryHashes: string[]
    }>
  }>(path.join(paths.bundleDir, 'receipt.json'))
  if (!receipt.database) issues.push('receipt is missing the database fingerprint')
  else {
    try {
      assertDatabaseFingerprint(receipt.database, paths.databasePath)
    } catch {
      issues.push('database fingerprint does not match the prepared insight bundle')
    }
  }
  const convDir = path.join(paths.bundleDir, 'conv')
  const files = fs.readdirSync(convDir).filter((file) => file.endsWith('.json')).sort()
  const insights = files.map((file) => ({ file, value: readJson<InsightConversation>(path.join(convDir, file)) }))
  const currentById = new Map(current.map((conversation) => [conversation.id, conversation]))
  const manifestById = new Map(manifest.map((conversation) => [conversation.convId, conversation]))
  const insightById = new Map(insights.map((entry) => [entry.value.convId, entry]))
  const stateById = new Map(states.map((state) => [state.convId, state]))
  const expectedIds = new Set(currentById.keys())

  for (const [label, values] of [
    ['manifest', manifestById],
    ['insight', insightById],
    ['state', stateById],
  ] as const) {
    if (values.size !== expectedIds.size) issues.push(`${label} count does not match current conversations`)
    const missing = setDifference(expectedIds, new Set(values.keys()))
    const extra = setDifference(new Set(values.keys()), expectedIds)
    if (missing.length > 0) issues.push(`${label} is missing ${missing.length} current conversation ids`)
    if (extra.length > 0) issues.push(`${label} contains ${extra.length} unknown conversation ids`)
  }
  if (manifestById.size !== manifest.length) issues.push('manifest contains duplicate conversation ids')
  if (insightById.size !== insights.length) issues.push('insight files contain duplicate conversation ids')
  if (stateById.size !== states.length) issues.push('state contains duplicate conversation ids')
  if (receipt.status !== 'complete') issues.push('receipt is not complete')
  if (receipt.boardBuild?.status !== 'complete') issues.push('board build is not complete')
  const deltaEvidence = receipt.deltaEvidence
  const distillation = receipt.distillation
  if (!deltaEvidence || !distillation) issues.push('receipt is missing delta closure evidence')
  else if (
    deltaEvidence.queriedRows !== deltaEvidence.textGrowth
    || distillation.processed !== deltaEvidence.conversations
    || distillation.inputRows !== deltaEvidence.queriedRows
    || Number(distillation.eligibleRows) > Number(distillation.inputRows)
    || Number(distillation.selectedRows) > Number(distillation.eligibleRows)
    || Number(distillation.addedNuggets) > Number(distillation.selectedRows)
  ) issues.push('delta closure evidence does not reconcile')
  if (!Array.isArray(receipt.baselineEvidence)) issues.push('receipt is missing baseline insight evidence')
  else {
    let missingBaselineNuggets = 0
    let missingBaselineSummaries = 0
    for (const baseline of receipt.baselineEvidence) {
      const insight = insightById.get(baseline.convId)?.value
      if (!insight) {
        missingBaselineNuggets += baseline.nuggetHashes.length
        missingBaselineSummaries += baseline.summaryHashes.length
        continue
      }
      const currentNuggets = new Set(
        (insight.nuggets ?? []).map((nugget) => sha256Text(insightNuggetEvidenceKey(nugget))),
      )
      const currentSummaries = new Set(
        (insight.legacySummaries ?? []).map((entry) => sha256Text(`${entry.convId}\n${entry.summary}`)),
      )
      missingBaselineNuggets += baseline.nuggetHashes.filter((hash) => !currentNuggets.has(hash)).length
      missingBaselineSummaries += baseline.summaryHashes.filter((hash) => !currentSummaries.has(hash)).length
    }
    if (missingBaselineNuggets > 0) {
      issues.push(`baseline insight evidence is missing ${missingBaselineNuggets} nuggets`)
    }
    if (missingBaselineSummaries > 0) {
      issues.push(`baseline insight evidence is missing ${missingBaselineSummaries} summaries`)
    }
  }
  const cursorDb = new DatabaseSync(paths.databasePath, { readOnly: true })
  try {
    const messageColumns = new Set(
      (cursorDb.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((row) => row.name),
    )
    const canonical = messageColumns.has('canonical_seq') && messageColumns.has('occurred_at_epoch_s')
    const cursorExists = cursorDb.prepare(canonical
      ? `SELECT count(*) AS count FROM messages WHERE conv_id=? AND message_uid=?
          AND canonical_seq=? AND occurred_at_epoch_s=? AND type=1 AND length(text)>0`
      : `SELECT count(*) AS count FROM messages WHERE conv_id=? AND message_uid=?
          AND time=? AND type=1 AND length(text)>0`)
    for (const state of states) {
      if (!state.analyzedLastMessageUid) continue
      if (canonical && !Number.isSafeInteger(state.analyzedLastSequence)) {
        issues.push(`state cursor does not resolve for ${state.convId}`)
        continue
      }
      const params = canonical
        ? [state.convId, state.analyzedLastMessageUid, state.analyzedLastSequence!, state.analyzedLastTime]
        : [state.convId, state.analyzedLastMessageUid, state.analyzedLastTime]
      const match = cursorExists.get(...params) as { count: number }
      if (Number(match.count) !== 1) issues.push(`state cursor does not resolve for ${state.convId}`)
    }
  } finally {
    cursorDb.close()
  }

  let nuggets = 0
  const insightCategories = new Set<string>()
  for (const conversation of current) {
    const manifestEntry = manifestById.get(conversation.id)
    const insightEntry = insightById.get(conversation.id)
    const state = stateById.get(conversation.id)
    if (manifestEntry && (
      manifestEntry.name !== conversation.display ||
      manifestEntry.isGroup !== conversation.isGroup ||
      Number(manifestEntry.textCount) !== conversation.textCount
    )) issues.push(`manifest metadata mismatch for ${conversation.id}`)
    if (insightEntry) {
      const insight = insightEntry.value
      if (insightEntry.file !== insightFilename(conversation.id)) {
        issues.push(`insight filename mismatch for ${conversation.id}`)
      }
      if (insight.name !== conversation.display || insight.isGroup !== conversation.isGroup) {
        issues.push(`insight metadata mismatch for ${conversation.id}`)
      }
      for (const nugget of insight.nuggets ?? []) {
        nuggets++
        insightCategories.add(nugget.category)
        if (!allowedCategories.has(nugget.category)) issues.push(`invalid nugget category for ${conversation.id}`)
        if (!nugget.title?.trim() || !nugget.content?.trim()) issues.push(`empty nugget content for ${conversation.id}`)
        if (Array.from(nugget.content ?? '').length > 140) issues.push(`oversized nugget content for ${conversation.id}`)
        if (nugget.importance !== undefined && (
          !Number.isInteger(nugget.importance) || nugget.importance < 1 || nugget.importance > 5
        )) issues.push(`invalid nugget importance for ${conversation.id}`)
      }
    }
    if (state && (
      state.analyzedTextCount > conversation.textCount ||
      state.analyzedLastTime > conversation.lastTime
    )) issues.push(`state exceeds current conversation high-water mark for ${conversation.id}`)
  }
  const boardsDir = path.join(paths.bundleDir, 'boards')
  const boards = fs.existsSync(boardsDir)
    ? fs.readdirSync(boardsDir).filter((file) => file.endsWith('.md')).length
    : 0
  const boardCategories = new Set(
    fs.existsSync(boardsDir)
      ? fs.readdirSync(boardsDir).filter((file) => file.endsWith('.md')).map((file) => file.replace(/\.md$/u, ''))
      : [],
  )
  if (setDifference(insightCategories, boardCategories).length > 0) {
    issues.push('boards are missing one or more insight categories')
  }
  if (setDifference(boardCategories, insightCategories).length > 0) {
    issues.push('boards contain one or more stale categories')
  }
  if (receipt.boardBuild?.boards !== boards || receipt.boardBuild?.nuggets !== nuggets) {
    issues.push('board receipt counts do not match insight content')
  }
  if (boardsDir && fs.existsSync(boardsDir)) {
    for (const file of fs.readdirSync(boardsDir).filter((name) => name.endsWith('.md'))) {
      readUtf8(path.join(boardsDir, file))
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    metrics: {
      currentConversations: current.length,
      manifestConversations: manifest.length,
      insightConversations: insights.length,
      stateConversations: states.length,
      nuggets,
      boards,
    },
  }
}
