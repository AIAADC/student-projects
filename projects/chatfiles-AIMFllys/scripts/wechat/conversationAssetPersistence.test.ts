import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { artifactInserter, createOutputSchema, startAssetRun } from './conversationAssetBuilderSchema.js'
import type { ConversationArtifactRecord } from './conversationAssetModel.js'

const digest = `sha256:${'a'.repeat(64)}`

function record(
  resourceId: string,
  status: 'exact' | 'partial' | 'conflict' | 'missing',
  candidates: string[],
): ConversationArtifactRecord {
  const ordinary = status === 'exact'
  return {
    asset_id: ordinary ? resourceId.padStart(64, '0') : null,
    conv_id: ordinary ? 'conv-a' : null,
    message_uid: ordinary ? 'uid-exact' : status === 'partial' ? 'uid-partial' : null,
    resource_message_id: `message-${resourceId}`,
    resource_id: resourceId,
    resource_type: '3342339',
    data_index: '0',
    category: 'document',
    kind: 'resource',
    name: '资料.pdf',
    preview: 'pdf',
    url: null,
    source_relative_path: null,
    source_size: null,
    created_at: 1,
    canonical_seq: ordinary ? 0 : null,
    sender_name: '成员',
    text: '',
    alignment_status: status,
    confirmation_status: ordinary ? 'confirmed' : 'unconfirmed',
    association_reason: ordinary ? null : 'message_alignment_not_exact',
    candidate_message_uids: JSON.stringify(candidates),
    matched_fields: JSON.stringify(status === 'missing' ? [] : ['local_id']),
    missing_fields: JSON.stringify(status === 'partial' ? ['create_time'] : []),
    conflicting_fields: JSON.stringify(status === 'conflict' ? ['message_uid'] : []),
    evidence_kind: 'lookup_evidence',
    evidence_signature: digest,
    packed_info_valid: status !== 'missing',
    detail_packed_info_valid: true,
    lookup_evidence: JSON.stringify(['0123456789abcdef0123456789abcdef']),
    filenames: JSON.stringify(['资料.pdf']),
    packed_info_payload_sha256: digest,
    source_match_method: 'missing',
    source_presence: 'missing',
    source_content_sha256: null,
    materialized_relative_path: null,
    materialized_size: null,
    materialized_content_sha256: null,
    media_format: null,
    expected_size: 10,
    detail_status: 1,
    materialization: 'source_missing',
    preview_status: 'unavailable',
    failure_reason: 'local_source_not_found',
  }
}

test('persists exact, partial, conflict, and missing associations without promoting quarantine', () => {
  const database = new DatabaseSync(':memory:')
  try {
    createOutputSchema(database)
    startAssetRun(database, 'fixture', {
      owner: 'owner',
      sourceSnapshotId: 'snapshot',
      sourceSnapshotRootFingerprint: digest,
      accountRootFingerprint: digest,
      canonicalRunId: 'canonical-run',
      canonicalSchemaVersion: 2,
      canonicalDatabaseSha256: digest,
      sourceManifestSha256: digest,
      resourceDatabaseSha256: digest,
    })
    const insert = artifactInserter(database, 'fixture')
    insert(record('1', 'exact', ['uid-exact']))
    insert(record('2', 'partial', ['uid-partial']))
    insert(record('3', 'conflict', ['uid-a', 'uid-b']))
    insert(record('4', 'missing', []))

    assert.equal(database.prepare('SELECT count(*) AS count FROM assets').get()?.count, 1)
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM asset_associations WHERE quarantined=1').get()?.count,
      3,
    )
    assert.equal(database.prepare('SELECT count(*) AS count FROM asset_candidates').get()?.count, 4)
    assert.deepEqual({ ...database.prepare(`
      SELECT matched_fields_json,missing_fields_json,conflicting_fields_json,candidate_count
      FROM asset_associations WHERE association_status='conflict'
    `).get() }, {
      matched_fields_json: '["local_id"]',
      missing_fields_json: '[]',
      conflicting_fields_json: '["message_uid"]',
      candidate_count: 2,
    })
    assert.equal(
      database.prepare('SELECT count(*) AS count FROM asset_materializations').get()?.count,
      4,
    )
  } finally {
    database.close()
  }
})
