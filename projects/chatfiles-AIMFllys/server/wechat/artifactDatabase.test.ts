import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import {
  openValidatedArtifactDatabase,
  resolveArtifactDatabasePath,
} from './artifactDatabase.js'
import { addClosedDocumentAsset } from './artifactDatabaseTestSupport.js'
import { createCurrentDatabase } from './databaseOpenerTestFixtures.js'
import { digestFileContent } from './contentDigest.js'

function fixtureRoot(t: TestContext) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-artifact-db-'))
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }))
  return projectRoot
}

function createArtifactDatabase(
  projectRoot: string,
  options: { missingColumn?: boolean; runs?: Array<{ runId: string; status: string }> } = {},
) {
  const databasePath = resolveArtifactDatabasePath(projectRoot)
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  const sourceSize = options.missingColumn ? '' : 'source_size INTEGER,'
  db.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY,
      conv_id TEXT,
      message_uid TEXT,
      resource_message_id TEXT,
      resource_id TEXT,
      category TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      preview TEXT NOT NULL,
      url TEXT,
      source_relative_path TEXT,
      ${sourceSize}
      created_at INTEGER NOT NULL,
      sender_name TEXT NOT NULL,
      text TEXT NOT NULL,
      alignment_status TEXT NOT NULL,
      link_status TEXT NOT NULL,
      link_reason TEXT,
      candidate_message_uids TEXT NOT NULL,
      evidence_kind TEXT NOT NULL,
      evidence_signature TEXT NOT NULL,
      materialization TEXT NOT NULL,
      preview_status TEXT NOT NULL,
      failure_reason TEXT
    );
    CREATE TABLE asset_runs(
      run_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      resources INTEGER NOT NULL,
      exact_alignments INTEGER NOT NULL,
      partial_alignments INTEGER NOT NULL,
      missing_alignments INTEGER NOT NULL,
      conflicting_alignments INTEGER NOT NULL,
      confirmed_links INTEGER NOT NULL,
      unconfirmed_links INTEGER NOT NULL,
      exported INTEGER NOT NULL,
      failed INTEGER NOT NULL,
      voice_attempts INTEGER NOT NULL
    );
  `)
  const insert = db.prepare('INSERT INTO asset_runs VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)')
  for (const run of options.runs ?? [{ runId: 'run-1', status: 'complete' }]) {
    insert.run(run.runId, run.status, '2026-07-12T12:00:00.000Z')
  }
  db.close()
  return databasePath
}

function createNormalizedArtifactDatabase(
  projectRoot: string,
  omitCandidates = false,
  omitMaterializedEvidence = false,
) {
  const canonicalPath = createCurrentDatabase(projectRoot)
  const canonicalDigest = digestFileContent(canonicalPath)
  const databasePath = resolveArtifactDatabasePath(projectRoot)
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE asset_runs(
      run_id TEXT PRIMARY KEY,status TEXT,completed_at TEXT,schema_version INTEGER,owner TEXT,
      source_snapshot_id TEXT,source_snapshot_root_fingerprint TEXT,account_root_fingerprint TEXT,
      canonical_run_id TEXT,canonical_schema_version INTEGER,canonical_database_sha256 TEXT,
      source_manifest_sha256 TEXT,resource_database_sha256 TEXT,source_count INTEGER,
      resource_count INTEGER,asset_count INTEGER,association_count INTEGER,candidate_count INTEGER,
      materialization_count INTEGER,quarantined_count INTEGER,exact_alignments INTEGER,
      partial_alignments INTEGER,missing_alignments INTEGER,conflicting_alignments INTEGER,
      confirmed_associations INTEGER,unconfirmed_associations INTEGER,ready_count INTEGER,
      not_attempted_count INTEGER,unavailable_count INTEGER,voice_attempts INTEGER,
      audit_receipt_sha256 TEXT
    );
    CREATE TABLE asset_sources(
      source_id TEXT PRIMARY KEY,run_id TEXT,source_kind TEXT,resource_message_id TEXT,
      resource_row_id TEXT,resource_type TEXT,data_index TEXT,expected_size INTEGER,
      detail_status INTEGER,packed_info_valid INTEGER,detail_packed_info_valid INTEGER,
      lookup_evidence_json TEXT,filenames_json TEXT,packed_info_payload_sha256 TEXT,
      match_method TEXT,presence TEXT,source_relative_path TEXT,source_size INTEGER,
      source_content_sha256 TEXT
    );
    CREATE TABLE asset_associations(
      association_id TEXT PRIMARY KEY,run_id TEXT,source_id TEXT,association_status TEXT,
      confirmation_status TEXT,reason TEXT,message_uid TEXT,conv_id TEXT,matched_fields_json TEXT,
      missing_fields_json TEXT,conflicting_fields_json TEXT,candidate_count INTEGER,
      evidence_kind TEXT,quarantined INTEGER
    );
    ${omitCandidates ? '' : 'CREATE TABLE asset_candidates(association_id TEXT,message_uid TEXT,candidate_rank INTEGER);'}
    CREATE TABLE assets(
      asset_id TEXT PRIMARY KEY,run_id TEXT,association_id TEXT,category TEXT,kind TEXT,name TEXT,
      preview TEXT,url TEXT,created_at INTEGER,canonical_seq INTEGER,sender_name TEXT,text TEXT,
      evidence_signature TEXT
    );
    CREATE TABLE asset_materializations(
      source_id TEXT PRIMARY KEY,run_id TEXT,asset_id TEXT,status TEXT,preview_status TEXT,
      failure_reason TEXT${omitMaterializedEvidence ? '' : `,
      materialized_relative_path TEXT,materialized_size INTEGER,
      materialized_content_sha256 TEXT,media_format TEXT`}
    );
    CREATE VIEW artifacts AS SELECT
      NULL AS asset_id,NULL AS conv_id,NULL AS message_uid,NULL AS resource_message_id,
      NULL AS resource_id,NULL AS category,NULL AS kind,NULL AS name,NULL AS preview,NULL AS url,
      NULL AS source_relative_path,NULL AS source_size,NULL AS created_at,NULL AS sender_name,
      NULL AS text,NULL AS alignment_status,NULL AS link_status,NULL AS link_reason,
      NULL AS candidate_message_uids,NULL AS evidence_kind,NULL AS evidence_signature,
      NULL AS materialization,NULL AS preview_status,NULL AS failure_reason,
      NULL AS source_presence,NULL AS source_content_sha256,NULL AS association_status,
      NULL AS confirmation_status,NULL AS association_evidence,
      NULL AS materialized_relative_path,NULL AS materialized_size,
      NULL AS materialized_content_sha256,NULL AS media_format WHERE 0;
  `)
  const digest = `sha256:${'a'.repeat(64)}`
  db.prepare(`INSERT INTO asset_runs(
    run_id,status,completed_at,schema_version,owner,source_snapshot_id,
    source_snapshot_root_fingerprint,account_root_fingerprint,canonical_run_id,
    canonical_schema_version,canonical_database_sha256,source_manifest_sha256,
    resource_database_sha256,source_count,resource_count,asset_count,association_count,
    candidate_count,materialization_count,quarantined_count,exact_alignments,partial_alignments,
    missing_alignments,conflicting_alignments,confirmed_associations,unconfirmed_associations,
    ready_count,not_attempted_count,unavailable_count,voice_attempts,audit_receipt_sha256
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,?)`).run(
    'run-v2','complete','2026-07-12T12:00:00.000Z',2,'owner','snapshot',digest,digest,
    'run-0',2,canonicalDigest,digest,digest,digest,
  )
  db.close()
}

function addUnsafeNormalizedAsset(projectRoot: string) {
  const db = new DatabaseSync(resolveArtifactDatabasePath(projectRoot))
  db.exec(`
    UPDATE asset_runs SET source_count=1,resource_count=1,asset_count=1,
      association_count=1,materialization_count=1;
    INSERT INTO asset_sources VALUES(
      'source','run-v2','resource','message','row','type','0',1,1,1,1,'[]','[]',
      'sha256:${'a'.repeat(64)}','missing','missing',NULL,NULL,NULL
    );
    INSERT INTO asset_associations VALUES(
      'association','run-v2','source','partial','confirmed',NULL,'uid','conv','[]','[]','[]',
      0,'lookup_evidence',0
    );
    INSERT INTO assets VALUES(
      '${'b'.repeat(64)}','run-v2','association','document','resource','unsafe','pdf',NULL,1,0,
      '成员','', 'sha256:${'a'.repeat(64)}'
    );
    INSERT INTO asset_materializations(
      source_id,run_id,asset_id,status,preview_status,failure_reason
    ) VALUES(
      'source','run-v2','${'b'.repeat(64)}','ready','ready',NULL
    );
  `)
  db.close()
}

function addDigestlessReadyAsset(projectRoot: string, rawDat = false) {
  const db = new DatabaseSync(resolveArtifactDatabasePath(projectRoot))
  db.exec(`
    UPDATE asset_runs SET source_count=1,resource_count=1,asset_count=1,
      association_count=1,materialization_count=1;
    INSERT INTO asset_sources VALUES(
      'source','run-v2','resource','message','row','type','0',4,1,1,1,'[]','[]',
      'sha256:${'a'.repeat(64)}','lookup_exact','present','${rawDat ? 'ready.dat' : 'ready.pdf'}',4,
      ${rawDat ? `'sha256:${'b'.repeat(64)}'` : 'NULL'}
    );
    INSERT INTO asset_associations VALUES(
      'association','run-v2','source','exact','confirmed',NULL,'uid','conv','[]','[]','[]',
      0,'lookup_evidence',0
    );
    INSERT INTO assets VALUES(
      '${'c'.repeat(64)}','run-v2','association','document','resource','ready','pdf',NULL,1,0,
      '成员','', 'sha256:${'a'.repeat(64)}'
    );
    INSERT INTO asset_materializations(
      source_id,run_id,asset_id,status,preview_status,failure_reason
    ) VALUES(
      'source','run-v2','${'c'.repeat(64)}','ready','ready',NULL
    );
  `)
  db.close()
}

test('uses the current artifact bundle path by default', () => {
  assert.equal(
    resolveArtifactDatabasePath('C:\\project'),
    path.resolve('C:\\project', 'data', 'chat-assets.current', 'artifacts.db'),
  )
})

test('opens a regular validated artifact database read-only', (t) => {
  const projectRoot = fixtureRoot(t)
  createArtifactDatabase(projectRoot)

  const opened = openValidatedArtifactDatabase(projectRoot)
  assert.ok(opened.db)
  assert.equal(opened.code, 'ready')
  assert.throws(() => opened.db?.exec("INSERT INTO asset_runs VALUES ('x','complete','x',0,0,0,0,0,0,0,0,0,0)"))
  opened.db.close()
})

test('rejects missing, non-file, and corrupt artifact database candidates without exposing paths', (t) => {
  const projectRoot = fixtureRoot(t)

  const missing = openValidatedArtifactDatabase(projectRoot)
  assert.deepEqual(missing, { db: null, code: 'unavailable' })

  const databasePath = resolveArtifactDatabasePath(projectRoot)
  fs.mkdirSync(databasePath, { recursive: true })
  const directory = openValidatedArtifactDatabase(projectRoot)
  assert.deepEqual(directory, { db: null, code: 'unavailable' })

  fs.rmSync(databasePath, { recursive: true })
  fs.writeFileSync(databasePath, 'not sqlite', 'utf8')
  const corrupt = openValidatedArtifactDatabase(projectRoot)
  assert.deepEqual(corrupt, { db: null, code: 'unavailable' })
  assert.doesNotMatch(JSON.stringify(corrupt), new RegExp(projectRoot.replaceAll('\\', '\\\\')))
})

test('rejects missing schema columns and any non-unique or incomplete asset run', (t) => {
  const roots = [fixtureRoot(t), fixtureRoot(t), fixtureRoot(t), fixtureRoot(t)]
  createArtifactDatabase(roots[0], { missingColumn: true })
  createArtifactDatabase(roots[1], { runs: [] })
  createArtifactDatabase(roots[2], {
    runs: [{ runId: 'run-1', status: 'complete' }, { runId: 'run-2', status: 'complete' }],
  })
  createArtifactDatabase(roots[3], { runs: [{ runId: 'run-1', status: 'building' }] })

  for (const projectRoot of roots) {
    assert.deepEqual(openValidatedArtifactDatabase(projectRoot), { db: null, code: 'unavailable' })
  }
})

test('accepts a closed normalized v2 asset store and rejects an incomplete normalized shape', (t) => {
  const readyRoot = fixtureRoot(t)
  const incompleteRoot = fixtureRoot(t)
  const unsafeRoot = fixtureRoot(t)
  const staleRoot = fixtureRoot(t)
  const digestlessRoot = fixtureRoot(t)
  const missingMaterializedRoot = fixtureRoot(t)
  const rawDatRoot = fixtureRoot(t)
  const linkedRoot = fixtureRoot(t)
  const unlinkedRoot = fixtureRoot(t)
  createNormalizedArtifactDatabase(readyRoot)
  createNormalizedArtifactDatabase(incompleteRoot, true)
  createNormalizedArtifactDatabase(unsafeRoot)
  addUnsafeNormalizedAsset(unsafeRoot)
  createNormalizedArtifactDatabase(staleRoot)
  createNormalizedArtifactDatabase(digestlessRoot)
  createNormalizedArtifactDatabase(missingMaterializedRoot, false, true)
  createNormalizedArtifactDatabase(rawDatRoot); addDigestlessReadyAsset(rawDatRoot, true)
  createNormalizedArtifactDatabase(linkedRoot); addClosedDocumentAsset(linkedRoot, true)
  createNormalizedArtifactDatabase(unlinkedRoot); addClosedDocumentAsset(unlinkedRoot, false)
  addDigestlessReadyAsset(digestlessRoot)
  const staleCanonical = new DatabaseSync(path.join(staleRoot, 'data', 'wechat.current', 'wechat.db'))
  staleCanonical.prepare("UPDATE people SET display_name='另一机主'").run()
  staleCanonical.close()

  const ready = openValidatedArtifactDatabase(readyRoot)
  assert.equal(ready.code, 'ready')
  ready.db?.close()
  assert.deepEqual(openValidatedArtifactDatabase(incompleteRoot), { db: null, code: 'unavailable' })
  assert.deepEqual(openValidatedArtifactDatabase(unsafeRoot), { db: null, code: 'unavailable' })
  assert.deepEqual(openValidatedArtifactDatabase(staleRoot), { db: null, code: 'unavailable' })
  assert.deepEqual(openValidatedArtifactDatabase(digestlessRoot), { db: null, code: 'unavailable' })
  assert.deepEqual(openValidatedArtifactDatabase(missingMaterializedRoot), { db: null, code: 'unavailable' })
  assert.deepEqual(openValidatedArtifactDatabase(rawDatRoot), { db: null, code: 'unavailable' })
  const linked = openValidatedArtifactDatabase(linkedRoot)
  assert.equal(linked.code, 'ready')
  linked.db?.close()
  assert.deepEqual(openValidatedArtifactDatabase(unlinkedRoot), { db: null, code: 'unavailable' })
})
