import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { relativePathWithinRoot } from './assetEvidence.js'
import { fingerprintDirectory, type AssetBundleBinding } from './assetBundleBinding.js'
import { digestFileContent } from './assetContentDigest.js'
import {
  createAssetRunReceipt,
  createMaterializationEvidenceDigest,
  stableJson,
} from './assetRunReceipt.js'
import { auditMaterializedPaths } from './conversationMediaAudit.js'
import type { ConversationAssetAuditResult } from './conversationAssetAuditTypes.js'
import type {
  ConversationAssetCounts,
  ConversationAssetMetrics,
} from './conversationAssetBuilderSupport.js'

type IndexRecord = {
  version: number
  runId: string
  completedAt: string
  binding: AssetBundleBinding
  counts: ConversationAssetCounts
  metrics: ConversationAssetMetrics
  materializationEvidenceSha256: string
  receipt: string
}

const RUN_METRIC_COLUMNS = {
  source_count: 'sources',
  resource_count: 'resources',
  asset_count: 'assets',
  association_count: 'associations',
  candidate_count: 'candidates',
  materialization_count: 'materializations',
  quarantined_count: 'quarantined',
  exact_alignments: 'exactAlignments',
  partial_alignments: 'partialAlignments',
  missing_alignments: 'missingAlignments',
  conflicting_alignments: 'conflictingAlignments',
  confirmed_associations: 'confirmedAssociations',
  unconfirmed_associations: 'unconfirmedAssociations',
  ready_count: 'ready',
  not_attempted_count: 'notAttempted',
  unavailable_count: 'unavailable',
  voice_attempts: 'voiceAttempts',
} as const satisfies Readonly<Record<string, keyof ConversationAssetMetrics>>

function readIndex(filename: string) {
  const text = new TextDecoder('utf-8', { fatal: true })
    .decode(fs.readFileSync(filename)).replace(/^\uFEFF/u, '')
  return JSON.parse(text) as IndexRecord
}

function count(database: DatabaseSync, sql: string, ...params: Array<string | number>) {
  return Number(database.prepare(sql).get(...params)?.count ?? 0)
}

function readCounts(database: DatabaseSync, chatText: number): ConversationAssetCounts {
  const counts: ConversationAssetCounts = { all: 0,work: 0,document: 0,skill: 0,link: 0,chatText }
  const rows = database.prepare('SELECT category,count(*) AS count FROM assets GROUP BY category').all() as Array<{
    category: 'work' | 'document' | 'skill' | 'link'
    count: number
  }>
  for (const row of rows) {
    counts[row.category] = Number(row.count)
    counts.all += Number(row.count)
  }
  return counts
}

function alignmentCount(database: DatabaseSync, status: string) {
  return count(database, `
    SELECT count(DISTINCT s.resource_message_id) AS count
    FROM asset_associations a JOIN asset_sources s ON s.source_id=a.source_id
    WHERE s.source_kind='resource' AND a.association_status=?
  `, status)
}

export function readConversationAssetMetrics(database: DatabaseSync): ConversationAssetMetrics {
  return {
    sources: count(database, 'SELECT count(*) AS count FROM asset_sources'),
    resources: count(database, "SELECT count(*) AS count FROM asset_sources WHERE source_kind='resource'"),
    assets: count(database, 'SELECT count(*) AS count FROM assets'),
    associations: count(database, 'SELECT count(*) AS count FROM asset_associations'),
    candidates: count(database, 'SELECT count(*) AS count FROM asset_candidates'),
    materializations: count(database, 'SELECT count(*) AS count FROM asset_materializations'),
    quarantined: count(database, 'SELECT count(*) AS count FROM asset_associations WHERE quarantined=1'),
    exactAlignments: alignmentCount(database, 'exact'),
    partialAlignments: alignmentCount(database, 'partial'),
    missingAlignments: alignmentCount(database, 'missing'),
    conflictingAlignments: alignmentCount(database, 'conflict'),
    confirmedAssociations: count(database, "SELECT count(*) AS count FROM asset_associations WHERE confirmation_status='confirmed'"),
    unconfirmedAssociations: count(database, "SELECT count(*) AS count FROM asset_associations WHERE confirmation_status='unconfirmed'"),
    ready: count(database, "SELECT count(*) AS count FROM asset_materializations WHERE status='ready'"),
    notAttempted: count(database, "SELECT count(*) AS count FROM asset_materializations WHERE status='not_attempted'"),
    unavailable: count(database, "SELECT count(*) AS count FROM asset_materializations WHERE status NOT IN('ready','not_attempted')"),
    voiceAttempts: count(database, "SELECT count(*) AS count FROM asset_sources WHERE source_kind='voice'"),
  }
}

export function assetBundleBindingFromRun(run: Record<string, unknown>): AssetBundleBinding {
  return {
    owner: String(run.owner),
    sourceSnapshotId: String(run.source_snapshot_id),
    sourceSnapshotRootFingerprint: String(run.source_snapshot_root_fingerprint),
    accountRootFingerprint: String(run.account_root_fingerprint),
    canonicalRunId: String(run.canonical_run_id),
    canonicalSchemaVersion: Number(run.canonical_schema_version),
    canonicalDatabaseSha256: String(run.canonical_database_sha256),
    sourceManifestSha256: String(run.source_manifest_sha256),
    resourceDatabaseSha256: String(run.resource_database_sha256),
  }
}

function auditSourcePaths(
  database: DatabaseSync,
  accountRoot: string,
  addIssue: (code: string, count?: number) => void,
) {
  const root = fs.realpathSync(accountRoot)
  let sourcePaths = 0
  const rows = database.prepare(`
    SELECT s.source_relative_path,s.source_size,s.source_content_sha256,s.presence,m.status
    FROM asset_sources s JOIN asset_materializations m ON m.source_id=s.source_id
    WHERE s.source_relative_path IS NOT NULL
  `).all() as Array<{
    source_relative_path: string
    source_size: number | null
    source_content_sha256: string | null
    presence: string
    status: string
  }>
  for (const row of rows) {
    sourcePaths++
    const target = path.resolve(root, ...row.source_relative_path.split(/[\\/]+/u))
    try {
      const real = fs.realpathSync(target)
      if (!relativePathWithinRoot(root, real).safe) {
        addIssue('unsafe-source-path')
        continue
      }
      const stat = fs.statSync(real)
      if (!stat.isFile()) addIssue('source-not-file')
      if (row.source_size === null || stat.size !== Number(row.source_size)) addIssue('source-size-mismatch')
      if (!row.source_content_sha256 || digestFileContent(real) !== row.source_content_sha256) {
        addIssue('source-content-digest-mismatch')
      }
    } catch {
      addIssue('missing-source-file')
    }
  }
  return sourcePaths
}

function invalidPresentEvidenceCount(database: DatabaseSync) {
  const rows = database.prepare(`
    SELECT source_relative_path,source_size,source_content_sha256
    FROM asset_sources WHERE source_kind='resource' AND presence='present'
  `).all() as Array<{
    source_relative_path: string | null
    source_size: number | null
    source_content_sha256: string | null
  }>
  return rows.filter((row) => (
    !row.source_relative_path
    || !Number.isSafeInteger(Number(row.source_size))
    || Number(row.source_size) < 0
    || !/^sha256:[a-f0-9]{64}$/u.test(row.source_content_sha256 ?? '')
  )).length
}

export function auditConversationAssetV2Bundle(options: {
  bundleDir: string
  accountRoot: string
}): ConversationAssetAuditResult {
  const issueCounts = new Map<string, number>()
  const addIssue = (code: string, amount = 1) => {
    if (amount > 0) issueCounts.set(code, (issueCounts.get(code) ?? 0) + amount)
  }
  if (fs.existsSync(path.join(options.bundleDir, '.media-materialization.json'))) {
    addIssue('materialization-journal-present')
  }
  const index = readIndex(path.join(options.bundleDir, 'index.json'))
  const database = new DatabaseSync(path.join(options.bundleDir, 'artifacts.db'), { readOnly: true })
  let counts: ConversationAssetCounts
  let metrics: ConversationAssetMetrics
  let sourcePaths: number
  try {
    if (database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') addIssue('integrity-check-failed')
    addIssue('foreign-key-check-failed', database.prepare('PRAGMA foreign_key_check').all().length)
    const runs = database.prepare('SELECT * FROM asset_runs LIMIT 2').all() as Array<Record<string, unknown>>
    const run = runs[0]
    if (runs.length !== 1 || !run || run.status !== 'complete' || Number(run.schema_version) !== 2) {
      addIssue('asset-run-invalid')
    }
    counts = readCounts(database, Number(index.counts?.chatText ?? 0))
    metrics = readConversationAssetMetrics(database)
    if (run) {
      for (const [column, metric] of Object.entries(RUN_METRIC_COLUMNS)) {
        if (Number(run[column]) !== metrics[metric]) addIssue(`run-count-mismatch:${column}`)
      }
    }
    addIssue('source-association-count-mismatch', Math.abs(metrics.sources - metrics.associations))
    addIssue('source-materialization-count-mismatch', Math.abs(metrics.sources - metrics.materializations))
    addIssue('ordinary-asset-count-mismatch', Math.abs(metrics.assets - (metrics.associations - metrics.quarantined)))
    addIssue('materialization-asset-link-mismatch', count(database, `
      SELECT count(*) AS count
      FROM asset_materializations m
      JOIN asset_associations aa ON aa.source_id=m.source_id
      LEFT JOIN assets a ON a.association_id=aa.association_id
      WHERE (aa.quarantined=0 AND (a.asset_id IS NULL OR m.asset_id IS NULL OR m.asset_id<>a.asset_id))
         OR (aa.quarantined=1 AND m.asset_id IS NOT NULL)
    `))
    addIssue('quarantined-asset', count(database, `
      SELECT count(*) AS count FROM assets a JOIN asset_associations aa ON aa.association_id=a.association_id
      WHERE aa.quarantined=1
    `))
    addIssue('unsafe-ordinary-association', count(database, `
      SELECT count(*) AS count FROM asset_associations
      WHERE quarantined=0 AND (association_status<>'exact' OR confirmation_status<>'confirmed')
    `))
    addIssue('candidate-count-mismatch', count(database, `
      SELECT count(*) AS count FROM asset_associations a
      WHERE candidate_count<>(SELECT count(*) FROM asset_candidates c WHERE c.association_id=a.association_id)
    `))
    addIssue('missing-failure-reason', count(database, `
      SELECT count(*) AS count FROM asset_materializations
      WHERE status NOT IN('ready','thumbnail_only') AND (failure_reason IS NULL OR trim(failure_reason)='')
    `))
    addIssue('unexpected-success-reason', count(database, `
      SELECT count(*) AS count FROM asset_materializations
      WHERE status IN('ready','thumbnail_only') AND failure_reason IS NOT NULL
    `))
    addIssue('present-source-evidence-missing', invalidPresentEvidenceCount(database))
    sourcePaths = auditSourcePaths(database, options.accountRoot, addIssue)
    auditMaterializedPaths(database, options.bundleDir, addIssue)
    if (run && String(run.account_root_fingerprint) !== fingerprintDirectory(options.accountRoot)) {
      addIssue('account-root-fingerprint-mismatch')
    }
    const binding = run ? assetBundleBindingFromRun(run) : index.binding
    const runId = String(run?.run_id ?? '')
    const completedAt = String(run?.completed_at ?? '')
    const materializationEvidenceSha256 = createMaterializationEvidenceDigest(database)
    const receipt = createAssetRunReceipt({
      runId,completedAt,binding,counts,metrics,materializationEvidenceSha256,
    })
    if (index.runId !== runId) addIssue('run-id-mismatch')
    if (index.completedAt !== completedAt) addIssue('run-completed-at-mismatch')
    if (!run || run.audit_receipt_sha256 !== receipt) addIssue('run-receipt-mismatch')
    if (index.version !== 2 || index.receipt !== receipt) addIssue('index-receipt-mismatch')
    if (stableJson(index.counts) !== stableJson(counts)) addIssue('index-counts-mismatch')
    if (stableJson(index.metrics) !== stableJson(metrics)) addIssue('index-metrics-mismatch')
    if (index.materializationEvidenceSha256 !== materializationEvidenceSha256) {
      addIssue('index-materialization-evidence-mismatch')
    }
    if (stableJson(index.binding) !== stableJson(binding)) addIssue('index-binding-mismatch')
  } finally {
    database.close()
  }
  const issues = [...issueCounts].map(([code, issueCount]) => ({ code, count: issueCount }))
    .sort((left, right) => left.code.localeCompare(right.code, 'en'))
  return {
    ok: issues.length === 0,
    counts,
    metrics: {
      artifacts: metrics.assets,
      sourcePaths,
      resources: metrics.resources,
      links: counts.link,
      voiceAttempts: metrics.voiceAttempts,
    },
    issues,
  }
}
