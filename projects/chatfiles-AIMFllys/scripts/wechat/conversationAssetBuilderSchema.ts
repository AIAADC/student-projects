import crypto from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { isIncludedInAll } from './assetEvidence.js'
import type { AssetBundleBinding } from './assetBundleBinding.js'
import type { ConversationArtifactRecord } from './conversationAssetModel.js'
import type {
  ConversationAssetCounts,
  ConversationAssetMetrics,
} from './conversationAssetBuilderSupport.js'

function stableId(prefix: string, ...parts: string[]) {
  return crypto.createHash('sha256').update([prefix, ...parts].join('\0'), 'utf8').digest('hex')
}

export function createOutputSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    CREATE TABLE asset_runs(
      run_id TEXT PRIMARY KEY,status TEXT NOT NULL,completed_at TEXT NOT NULL,schema_version INTEGER NOT NULL,
      owner TEXT NOT NULL,source_snapshot_id TEXT NOT NULL,source_snapshot_root_fingerprint TEXT NOT NULL,
      account_root_fingerprint TEXT NOT NULL,canonical_run_id TEXT NOT NULL,canonical_schema_version INTEGER NOT NULL,
      canonical_database_sha256 TEXT NOT NULL,source_manifest_sha256 TEXT NOT NULL,
      resource_database_sha256 TEXT NOT NULL,source_count INTEGER NOT NULL,resource_count INTEGER NOT NULL,
      asset_count INTEGER NOT NULL,association_count INTEGER NOT NULL,candidate_count INTEGER NOT NULL,
      materialization_count INTEGER NOT NULL,quarantined_count INTEGER NOT NULL,exact_alignments INTEGER NOT NULL,
      partial_alignments INTEGER NOT NULL,missing_alignments INTEGER NOT NULL,conflicting_alignments INTEGER NOT NULL,
      confirmed_associations INTEGER NOT NULL,unconfirmed_associations INTEGER NOT NULL,ready_count INTEGER NOT NULL,
      not_attempted_count INTEGER NOT NULL,unavailable_count INTEGER NOT NULL,voice_attempts INTEGER NOT NULL,
      audit_receipt_sha256 TEXT NOT NULL
    );
    CREATE TABLE asset_sources(
      source_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES asset_runs(run_id),source_kind TEXT NOT NULL,
      resource_message_id TEXT,resource_row_id TEXT,resource_type TEXT,data_index TEXT NOT NULL,
      expected_size INTEGER,detail_status INTEGER,packed_info_valid INTEGER NOT NULL,
      detail_packed_info_valid INTEGER NOT NULL,lookup_evidence_json TEXT NOT NULL,filenames_json TEXT NOT NULL,
      packed_info_payload_sha256 TEXT NOT NULL,match_method TEXT NOT NULL,presence TEXT NOT NULL,
      source_relative_path TEXT,source_size INTEGER,source_content_sha256 TEXT
    );
    CREATE TABLE asset_associations(
      association_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES asset_runs(run_id),
      source_id TEXT NOT NULL UNIQUE REFERENCES asset_sources(source_id),association_status TEXT NOT NULL,
      confirmation_status TEXT NOT NULL,reason TEXT,message_uid TEXT,conv_id TEXT,
      matched_fields_json TEXT NOT NULL,missing_fields_json TEXT NOT NULL,conflicting_fields_json TEXT NOT NULL,
      candidate_count INTEGER NOT NULL,evidence_kind TEXT NOT NULL,quarantined INTEGER NOT NULL CHECK(quarantined IN(0,1))
    );
    CREATE TABLE asset_candidates(
      association_id TEXT NOT NULL REFERENCES asset_associations(association_id),message_uid TEXT NOT NULL,
      candidate_rank INTEGER NOT NULL,PRIMARY KEY(association_id,message_uid),UNIQUE(association_id,candidate_rank)
    );
    CREATE TABLE assets(
      asset_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES asset_runs(run_id),
      association_id TEXT NOT NULL UNIQUE REFERENCES asset_associations(association_id),category TEXT NOT NULL,
      kind TEXT NOT NULL,name TEXT NOT NULL,preview TEXT NOT NULL,url TEXT,created_at INTEGER NOT NULL,
      canonical_seq INTEGER,sender_name TEXT NOT NULL,text TEXT NOT NULL,evidence_signature TEXT NOT NULL
    );
    CREATE TABLE asset_materializations(
      source_id TEXT PRIMARY KEY REFERENCES asset_sources(source_id),run_id TEXT NOT NULL REFERENCES asset_runs(run_id),
      asset_id TEXT REFERENCES assets(asset_id),status TEXT NOT NULL,preview_status TEXT NOT NULL,failure_reason TEXT,
      materialized_relative_path TEXT,materialized_size INTEGER,materialized_content_sha256 TEXT,media_format TEXT
    );
    CREATE INDEX idx_assets_category ON assets(category,created_at DESC,asset_id);
    CREATE INDEX idx_associations_conversation ON asset_associations(conv_id,message_uid);
    CREATE INDEX idx_sources_resource ON asset_sources(resource_message_id,resource_row_id);
    CREATE INDEX idx_materializations_status ON asset_materializations(status,preview_status);
    CREATE VIEW artifacts AS
      SELECT a.asset_id,aa.conv_id,aa.message_uid,s.resource_message_id,s.resource_row_id AS resource_id,
             a.category,a.kind,a.name,a.preview,a.url,s.source_relative_path,s.source_size,a.created_at,
             a.sender_name,a.text,aa.association_status AS alignment_status,
             aa.confirmation_status AS link_status,aa.reason AS link_reason,
             COALESCE((SELECT json_group_array(message_uid) FROM (
               SELECT message_uid FROM asset_candidates ac
               WHERE ac.association_id=aa.association_id ORDER BY candidate_rank
             )),'[]') AS candidate_message_uids,
             aa.evidence_kind,a.evidence_signature,m.status AS materialization,
             m.preview_status,m.failure_reason,m.materialized_relative_path,m.materialized_size,
             m.materialized_content_sha256,m.media_format,s.presence AS source_presence,
             s.source_content_sha256,aa.association_status,aa.confirmation_status,
             aa.evidence_kind AS association_evidence
      FROM assets a
      JOIN asset_associations aa ON aa.association_id=a.association_id
      JOIN asset_sources s ON s.source_id=aa.source_id
      JOIN asset_materializations m ON m.source_id=s.source_id;
  `)
}

export function startAssetRun(
  database: DatabaseSync,
  runId: string,
  binding: AssetBundleBinding,
) {
  database.prepare(`INSERT INTO asset_runs VALUES(
    ?, 'building', '', 2, ?, ?, ?, ?, ?, ?, ?, ?, ?,
    0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,''
  )`).run(
    runId,binding.owner,binding.sourceSnapshotId,binding.sourceSnapshotRootFingerprint,
    binding.accountRootFingerprint,binding.canonicalRunId,binding.canonicalSchemaVersion,
    binding.canonicalDatabaseSha256,binding.sourceManifestSha256,binding.resourceDatabaseSha256,
  )
}

export function artifactInserter(database: DatabaseSync, runId: string) {
  const source = database.prepare(`INSERT INTO asset_sources VALUES(
    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
  )`)
  const association = database.prepare(`INSERT INTO asset_associations VALUES(
    ?,?,?,?,?,?,?,?,?,?,?,?,?,?
  )`)
  const candidate = database.prepare('INSERT INTO asset_candidates VALUES(?,?,?)')
  const asset = database.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const materialization = database.prepare('INSERT INTO asset_materializations VALUES(?,?,?,?,?,?,?,?,?,?)')

  return (record: ConversationArtifactRecord) => {
    const sourceCoordinate = record.kind === 'resource'
      ? `${record.resource_message_id ?? ''}\0${record.resource_id ?? ''}`
      : `${record.message_uid ?? ''}\0${record.data_index}\0${record.evidence_signature}`
    const sourceId = stableId('asset-source-v2', runId, record.kind, sourceCoordinate)
    const associationId = stableId('asset-association-v2', sourceId)
    const quarantined = record.asset_id === null
      || record.alignment_status !== 'exact'
      || record.confirmation_status !== 'confirmed'
    const candidateUids = JSON.parse(record.candidate_message_uids) as unknown
    if (!Array.isArray(candidateUids) || candidateUids.some((value) => typeof value !== 'string' || !value)) {
      throw new Error('Invalid candidate message UID evidence')
    }
    source.run(
      sourceId,runId,record.kind,record.resource_message_id,record.resource_id,record.resource_type,
      record.data_index,record.expected_size,record.detail_status,Number(record.packed_info_valid),
      Number(record.detail_packed_info_valid),record.lookup_evidence,record.filenames,
      record.packed_info_payload_sha256,record.source_match_method,record.source_presence,
      record.source_relative_path,record.source_size,record.source_content_sha256,
    )
    association.run(
      associationId,runId,sourceId,record.alignment_status,record.confirmation_status,
      record.association_reason,record.message_uid,record.conv_id,record.matched_fields,
      record.missing_fields,record.conflicting_fields,candidateUids.length,record.evidence_kind,
      Number(quarantined),
    )
    candidateUids.forEach((messageUid, index) => candidate.run(associationId, messageUid, index))
    if (!quarantined && record.asset_id) {
      asset.run(
        record.asset_id,runId,associationId,record.category,record.kind,record.name,record.preview,
        record.url,record.created_at,record.canonical_seq,record.sender_name,record.text,
        record.evidence_signature,
      )
    }
    materialization.run(
      sourceId,runId,quarantined ? null : record.asset_id,record.materialization,
      record.preview_status,record.failure_reason,record.materialized_relative_path,
      record.materialized_size,record.materialized_content_sha256,record.media_format,
    )
    return { sourceId, assetInserted: !quarantined, quarantined }
  }
}

export function artifactCounts(
  database: DatabaseSync,
  wechat: DatabaseSync,
  sourceSnapshot: string,
): ConversationAssetCounts {
  const rows = database.prepare('SELECT category,count(*) AS count FROM assets GROUP BY category').all() as Array<{
    category: 'work' | 'document' | 'skill' | 'link'
    count: number
  }>
  const counts: ConversationAssetCounts = {
    all: 0,work: 0,document: 0,skill: 0,link: 0,
    chatText: Number(wechat.prepare(`SELECT count(*) AS count FROM messages
      WHERE type=1 AND source_snapshot=?`).get(sourceSnapshot)?.count ?? 0),
  }
  for (const row of rows) {
    counts[row.category] = Number(row.count)
    if (isIncludedInAll(row.category)) counts.all += Number(row.count)
  }
  return counts
}

export function completeAssetRun(
  database: DatabaseSync,
  runId: string,
  completedAt: string,
  metrics: ConversationAssetMetrics,
  receipt: string,
) {
  database.prepare(`UPDATE asset_runs SET
    status='complete',completed_at=?,source_count=?,resource_count=?,asset_count=?,association_count=?,
    candidate_count=?,materialization_count=?,quarantined_count=?,exact_alignments=?,partial_alignments=?,
    missing_alignments=?,conflicting_alignments=?,confirmed_associations=?,unconfirmed_associations=?,
    ready_count=?,not_attempted_count=?,unavailable_count=?,voice_attempts=?,audit_receipt_sha256=?
    WHERE run_id=? AND status='building'
  `).run(
    completedAt,metrics.sources,metrics.resources,metrics.assets,metrics.associations,metrics.candidates,
    metrics.materializations,metrics.quarantined,metrics.exactAlignments,metrics.partialAlignments,
    metrics.missingAlignments,metrics.conflictingAlignments,metrics.confirmedAssociations,
    metrics.unconfirmedAssociations,metrics.ready,metrics.notAttempted,metrics.unavailable,
    metrics.voiceAttempts,receipt,runId,
  )
}
