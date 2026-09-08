import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { relativePathWithinRoot } from './assetEvidence.js'
import type { ConversationAssetCounts } from './conversationAssetBuilder.js'
import { auditConversationAssetV2Bundle } from './conversationAssetV2Audit.js'
import type { ConversationAssetAuditResult } from './conversationAssetAuditTypes.js'
export type {
  ConversationAssetAuditIssue,
  ConversationAssetAuditResult,
} from './conversationAssetAuditTypes.js'

function readStrictJson(filename: string) {
  const bytes = fs.readFileSync(filename)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '')
  return JSON.parse(text) as {
    counts?: Partial<ConversationAssetCounts>
    metrics?: Record<string, unknown>
  }
}

function sqlCount(database: DatabaseSync, source: string) {
  return Number(database.prepare(source).get()?.count ?? 0)
}

function categoryCounts(database: DatabaseSync): ConversationAssetCounts {
  const statement = database.prepare('SELECT count(*) AS count FROM artifacts WHERE category=?')
  const count = (category: string) => Number(statement.get(category)?.count ?? 0)
  const work = count('work')
  const document = count('document')
  const skill = count('skill')
  const link = count('link')
  return { all: work + document + skill + link, work, document, skill, link, chatText: 0 }
}

function auditLegacyConversationAssetBundle(options: {
  bundleDir: string
  accountRoot: string
}): ConversationAssetAuditResult {
  const issueCounts = new Map<string, number>()
  const addIssue = (code: string, count = 1) => {
    if (count > 0) issueCounts.set(code, (issueCounts.get(code) ?? 0) + count)
  }
  const databasePath = path.join(options.bundleDir, 'artifacts.db')
  const indexPath = path.join(options.bundleDir, 'index.json')
  const index = readStrictJson(indexPath)
  const database = new DatabaseSync(databasePath, { readOnly: true })
  let counts: ConversationAssetCounts
  let metrics: ConversationAssetAuditResult['metrics']
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all()
    if (
      integrity.length === 0
      || integrity.some((row) => Object.values(row).some((value) => value !== 'ok'))
    ) {
      addIssue('integrity-check-failed')
    }
    addIssue('asset-run-invalid', sqlCount(
      database,
      "SELECT count(*) AS count FROM asset_runs WHERE status<>'complete'",
    ))
    if (sqlCount(database, 'SELECT count(*) AS count FROM asset_runs') !== 1) {
      addIssue('asset-run-count-invalid')
    }
    addIssue('invalid-category', sqlCount(
      database,
      "SELECT count(*) AS count FROM artifacts WHERE category NOT IN ('work','document','skill','link')",
    ))
    addIssue('missing-failure-reason', sqlCount(
      database,
      `SELECT count(*) AS count FROM artifacts
       WHERE materialization NOT IN ('exported','thumbnail_only')
       AND (failure_reason IS NULL OR trim(failure_reason)='')`,
    ))
    addIssue('unexpected-success-reason', sqlCount(
      database,
      `SELECT count(*) AS count FROM artifacts
       WHERE materialization IN ('exported','thumbnail_only') AND failure_reason IS NOT NULL`,
    ))
    addIssue('missing-link-reason', sqlCount(
      database,
      `SELECT count(*) AS count FROM artifacts
       WHERE link_status='unconfirmed' AND (link_reason IS NULL OR trim(link_reason)='')`,
    ))
    addIssue('unexpected-confirmed-link-reason', sqlCount(
      database,
      `SELECT count(*) AS count FROM artifacts
       WHERE link_status='confirmed' AND link_reason IS NOT NULL`,
    ))
    addIssue('confirmed-link-without-message', sqlCount(
      database,
      "SELECT count(*) AS count FROM artifacts WHERE link_status='confirmed' AND message_uid IS NULL",
    ))
    addIssue('exported-resource-without-path', sqlCount(
      database,
      `SELECT count(*) AS count FROM artifacts
       WHERE kind='resource' AND materialization='exported' AND source_relative_path IS NULL`,
    ))

    counts = categoryCounts(database)
    counts.chatText = Number(index.counts?.chatText ?? 0)
    for (const key of ['all', 'work', 'document', 'skill', 'link', 'chatText'] as const) {
      if (counts[key] !== Number(index.counts?.[key] ?? -1)) addIssue(`index-count-mismatch:${key}`)
    }

    const accountRootReal = fs.realpathSync(options.accountRoot)
    let sourcePaths = 0
    const sourceRows = database.prepare(`
      SELECT source_relative_path, source_size
      FROM artifacts WHERE source_relative_path IS NOT NULL
    `).iterate() as Iterable<{ source_relative_path: string; source_size: number | null }>
    for (const row of sourceRows) {
      sourcePaths++
      if (path.win32.isAbsolute(row.source_relative_path)) {
        addIssue('unsafe-source-path')
        continue
      }
      const target = path.resolve(accountRootReal, ...row.source_relative_path.split(/[\\/]+/u))
      if (!fs.existsSync(target)) {
        addIssue('missing-source-file')
        continue
      }
      const targetReal = fs.realpathSync(target)
      if (!relativePathWithinRoot(accountRootReal, targetReal).safe) {
        addIssue('unsafe-source-path')
        continue
      }
      const stat = fs.statSync(targetReal)
      if (!stat.isFile()) addIssue('source-not-file')
      if (row.source_size !== null && stat.size !== Number(row.source_size)) {
        addIssue('source-size-mismatch')
      }
    }

    const candidateRows = database.prepare('SELECT candidate_message_uids FROM artifacts').iterate() as Iterable<{
      candidate_message_uids: string
    }>
    for (const row of candidateRows) {
      try {
        const values = JSON.parse(row.candidate_message_uids)
        if (
          !Array.isArray(values)
          || values.some((value) => typeof value !== 'string' || !value)
          || new Set(values).size !== values.length
        ) {
          addIssue('invalid-candidate-message-uids')
        }
      } catch {
        addIssue('invalid-candidate-message-uids')
      }
    }

    const urlRows = database.prepare("SELECT url FROM artifacts WHERE category='link'").iterate() as Iterable<{
      url: string | null
    }>
    for (const row of urlRows) {
      try {
        const url = new URL(row.url ?? '')
        if (url.protocol !== 'http:' && url.protocol !== 'https:') addIssue('invalid-link-url')
      } catch {
        addIssue('invalid-link-url')
      }
    }

    metrics = {
      artifacts: sqlCount(database, 'SELECT count(*) AS count FROM artifacts'),
      sourcePaths,
      resources: sqlCount(database, "SELECT count(*) AS count FROM artifacts WHERE kind='resource'"),
      links: sqlCount(database, "SELECT count(*) AS count FROM artifacts WHERE kind='link'"),
      voiceAttempts: sqlCount(database, "SELECT count(*) AS count FROM artifacts WHERE kind='voice'"),
    }
  } finally {
    database.close()
  }

  const issues = [...issueCounts]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => left.code < right.code ? -1 : left.code > right.code ? 1 : 0)
  return { ok: issues.length === 0, counts, metrics, issues }
}

export function auditConversationAssetBundle(options: {
  bundleDir: string
  accountRoot: string
}): ConversationAssetAuditResult {
  const databasePath = path.join(options.bundleDir, 'artifacts.db')
  const database = new DatabaseSync(databasePath, { readOnly: true })
  let normalized: boolean
  try {
    normalized = Boolean(database.prepare(`
      SELECT 1 FROM sqlite_master WHERE type='table' AND name='asset_sources'
    `).get())
  } finally {
    database.close()
  }
  return normalized
    ? auditConversationAssetV2Bundle(options)
    : auditLegacyConversationAssetBundle(options)
}
