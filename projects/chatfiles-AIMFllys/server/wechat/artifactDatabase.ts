import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { openValidatedWechatDatabase } from './databaseOpener.js'
import { cachedFileContentDigest } from './contentDigest.js'

const legacySchema = {
  artifacts: [
    'asset_id','conv_id','message_uid','resource_message_id','resource_id','category','kind','name',
    'preview','url','source_relative_path','source_size','created_at','sender_name','text',
    'alignment_status','link_status','link_reason','candidate_message_uids','evidence_kind',
    'evidence_signature','materialization','preview_status','failure_reason',
  ],
  asset_runs: [
    'run_id','status','completed_at','resources','exact_alignments','partial_alignments',
    'missing_alignments','conflicting_alignments','confirmed_links','unconfirmed_links','exported',
    'failed','voice_attempts',
  ],
} as const

const normalizedSchema = {
  asset_runs: [
    'run_id','status','completed_at','schema_version','owner','source_snapshot_id',
    'source_snapshot_root_fingerprint','account_root_fingerprint','canonical_run_id',
    'canonical_schema_version','canonical_database_sha256','source_manifest_sha256',
    'resource_database_sha256','source_count','resource_count','asset_count','association_count',
    'candidate_count','materialization_count','quarantined_count','exact_alignments',
    'partial_alignments','missing_alignments','conflicting_alignments','confirmed_associations',
    'unconfirmed_associations','ready_count','not_attempted_count','unavailable_count',
    'voice_attempts','audit_receipt_sha256',
  ],
  asset_sources: [
    'source_id','run_id','source_kind','resource_message_id','resource_row_id','resource_type',
    'data_index','expected_size','detail_status','packed_info_valid','detail_packed_info_valid',
    'lookup_evidence_json','filenames_json','packed_info_payload_sha256','match_method','presence',
    'source_relative_path','source_size','source_content_sha256',
  ],
  asset_associations: [
    'association_id','run_id','source_id','association_status','confirmation_status','reason',
    'message_uid','conv_id','matched_fields_json','missing_fields_json','conflicting_fields_json',
    'candidate_count','evidence_kind','quarantined',
  ],
  asset_candidates: ['association_id','message_uid','candidate_rank'],
  assets: [
    'asset_id','run_id','association_id','category','kind','name','preview','url','created_at',
    'canonical_seq','sender_name','text','evidence_signature',
  ],
  asset_materializations: [
    'source_id','run_id','asset_id','status','preview_status','failure_reason',
    'materialized_relative_path','materialized_size','materialized_content_sha256','media_format',
  ],
  artifacts: [
    ...legacySchema.artifacts,'source_presence','source_content_sha256','association_status',
    'confirmation_status','association_evidence','materialized_relative_path','materialized_size',
    'materialized_content_sha256','media_format',
  ],
} as const

export type OpenedArtifactDatabase = { db: DatabaseSync | null; code: 'ready' | 'unavailable' }

export function resolveArtifactDatabasePath(projectRoot: string) {
  return path.resolve(projectRoot, 'data', 'chat-assets.current', 'artifacts.db')
}

function hasSchema(db: DatabaseSync, schema: Readonly<Record<string, readonly string[]>>) {
  for (const [table, required] of Object.entries(schema)) {
    const available = new Set((db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{
      name: string
    }>).map((row) => row.name))
    if (required.some((column) => !available.has(column))) return false
  }
  return true
}

function tableExists(db: DatabaseSync, table: string) {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table))
}

function hasCompleteLegacyRun(db: DatabaseSync) {
  const rows = db.prepare('SELECT run_id,status,completed_at FROM asset_runs LIMIT 2').all() as Array<{
    run_id: string; status: string; completed_at: string
  }>
  return rows.length === 1 && rows[0]?.status === 'complete'
    && Boolean(rows[0].run_id.trim()) && Boolean(rows[0].completed_at.trim())
}

function sqlCount(db: DatabaseSync, table: string, where = '') {
  return Number(db.prepare(`SELECT count(*) AS count FROM ${table}${where}`).get()?.count ?? 0)
}

function hasCompleteNormalizedRun(db: DatabaseSync) {
  const rows = db.prepare('SELECT * FROM asset_runs LIMIT 2').all() as Array<Record<string, unknown>>
  const run = rows[0]
  if (rows.length !== 1 || !run || run.status !== 'complete' || Number(run.schema_version) !== 2) return false
  const digestColumns = [
    'source_snapshot_root_fingerprint','account_root_fingerprint','canonical_database_sha256',
    'source_manifest_sha256','resource_database_sha256','audit_receipt_sha256',
  ]
  if (digestColumns.some((column) => !/^sha256:[a-f0-9]{64}$/u.test(String(run[column] ?? '')))) return false
  const expected: Array<[string, number]> = [
    ['source_count', sqlCount(db, 'asset_sources')],
    ['resource_count', sqlCount(db, 'asset_sources', " WHERE source_kind='resource'")],
    ['asset_count', sqlCount(db, 'assets')],
    ['association_count', sqlCount(db, 'asset_associations')],
    ['candidate_count', sqlCount(db, 'asset_candidates')],
    ['materialization_count', sqlCount(db, 'asset_materializations')],
    ['quarantined_count', sqlCount(db, 'asset_associations', ' WHERE quarantined=1')],
  ]
  const unsafeOrdinary = Number(db.prepare(`
    SELECT count(*) AS count
    FROM assets a JOIN asset_associations aa ON aa.association_id=a.association_id
    WHERE aa.association_status<>'exact' OR aa.confirmation_status<>'confirmed' OR aa.quarantined<>0
  `).get()?.count ?? 0)
  const invalidMaterializationLinks = Number(db.prepare(`
    SELECT count(*) AS count
    FROM asset_materializations m
    JOIN asset_associations aa ON aa.source_id=m.source_id
    LEFT JOIN assets a ON a.association_id=aa.association_id
    WHERE (aa.quarantined=0 AND (a.asset_id IS NULL OR m.asset_id IS NULL OR m.asset_id<>a.asset_id))
       OR (aa.quarantined=1 AND m.asset_id IS NOT NULL)
  `).get()?.count ?? 0)
  const readySources = db.prepare(`
    SELECT s.presence,s.source_relative_path,s.source_size,s.source_content_sha256
    FROM assets a
    JOIN asset_associations aa ON aa.association_id=a.association_id
    JOIN asset_sources s ON s.source_id=aa.source_id
    JOIN asset_materializations m ON m.source_id=s.source_id
    WHERE a.kind='resource' AND m.status='ready'
  `).all() as Array<{
    presence: string
    source_relative_path: string | null
    source_size: number | null
    source_content_sha256: string | null
  }>
  const readySourcesValid = readySources.every((source) => (
    source.presence === 'present'
    && Boolean(source.source_relative_path)
    && Number.isSafeInteger(Number(source.source_size))
    && Number(source.source_size) >= 0
    && /^sha256:[a-f0-9]{64}$/u.test(source.source_content_sha256 ?? '')
  ))
  const readyMedia = db.prepare(`
    SELECT s.source_kind,s.source_relative_path,m.materialized_relative_path,
           m.materialized_size,m.materialized_content_sha256,m.media_format
    FROM asset_materializations m JOIN asset_sources s ON s.source_id=m.source_id
    WHERE m.status IN('ready','thumbnail_only')
      AND (s.source_kind='voice' OR lower(s.source_relative_path) LIKE '%.dat')
  `).all() as Array<Record<string, unknown>>
  const readyMediaValid = readyMedia.every((row) => (
    Boolean(row.materialized_relative_path)
    && Number.isSafeInteger(Number(row.materialized_size))
    && Number(row.materialized_size) >= 0
    && /^sha256:[a-f0-9]{64}$/u.test(String(row.materialized_content_sha256 ?? ''))
    && /^(?:jpeg|png|gif|webp|silk|amr|amr-wb)$/u.test(String(row.media_format ?? ''))
  ))
  return unsafeOrdinary === 0 && invalidMaterializationLinks === 0
    && readySourcesValid && readyMediaValid
    && expected.every(([column, value]) => Number(run[column]) === value)
}

export function validArtifactDatabase(db: DatabaseSync) {
  if (tableExists(db, 'asset_sources')) {
    return hasSchema(db, normalizedSchema) && hasCompleteNormalizedRun(db)
  }
  return hasSchema(db, legacySchema) && hasCompleteLegacyRun(db)
}

function matchesActiveCanonical(assetDb: DatabaseSync, projectRoot: string) {
  const binding = assetDb.prepare(`
    SELECT canonical_run_id,canonical_schema_version,canonical_database_sha256
    FROM asset_runs
  `).get() as {
    canonical_run_id: string
    canonical_schema_version: number
    canonical_database_sha256: string
  } | undefined
  if (!binding) return false
  const active = openValidatedWechatDatabase(projectRoot)
  try {
    if (!active.db || active.resolution.source !== 'current' || !active.resolution.selectedPath) return false
    const run = active.db.prepare('SELECT run_id,schema_version FROM parse_runs LIMIT 2').all() as Array<{
      run_id: string
      schema_version: number
    }>
    return run.length === 1
      && run[0]?.run_id === binding.canonical_run_id
      && Number(run[0].schema_version) === Number(binding.canonical_schema_version)
      && cachedFileContentDigest(active.resolution.selectedPath) === binding.canonical_database_sha256
  } finally {
    active.db?.close()
  }
}

export function openValidatedArtifactDatabase(projectRoot: string): OpenedArtifactDatabase {
  const databasePath = resolveArtifactDatabasePath(projectRoot)
  let db: DatabaseSync | null = null
  try {
    if (!fs.statSync(databasePath).isFile()) return { db: null, code: 'unavailable' }
    db = new DatabaseSync(databasePath, { readOnly: true })
    const normalized = tableExists(db, 'asset_sources')
    if (!validArtifactDatabase(db) || (normalized && !matchesActiveCanonical(db, projectRoot))) {
      db.close()
      return { db: null, code: 'unavailable' }
    }
    return { db, code: 'ready' }
  } catch {
    try { db?.close() } catch { /* Keep validation errors private. */ }
    return { db: null, code: 'unavailable' }
  }
}
