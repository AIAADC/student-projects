import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createCurrentDatabase, createLegacyDatabase, fixtureRoot } from '../wechat/databaseOpenerTestFixtures.js'
import { runtimeDigestFile } from './catalogRuntimeFiles.js'
import { openCatalogArtifactDatabase, openCatalogWechatDatabase } from './productDatabases.js'

test('opens only the catalog-bound canonical database and never falls back to legacy', (t) => {
  const root = fixtureRoot(t)
  const databasePath = createCurrentDatabase(root)
  createLegacyDatabase(root)
  const rootDir = path.dirname(databasePath)
  const stat = fs.statSync(databasePath)
  const manifest = {
    schemaVersion: 1 as const,kind: 'wechat' as const,runId: 'run-0',
    domainSchemaVersion: 2,
    createdAt: '2026-07-13T00:00:00.000Z',bundleSha256: `sha256:${'a'.repeat(64)}`,
    domainReceiptSha256: `sha256:${'b'.repeat(64)}`,entrypoints: { database: 'wechat.db' },
    files: [{ relativePath: 'wechat.db',size: stat.size,sha256: runtimeDigestFile(databasePath) }],
    dependencies: {},counts: { messages: 2 },
  }
  const active = {
    state: 'ready' as const,catalog: null,status: {} as never,
    products: { wechat: { root: rootDir,manifest } },
  }
  const opened = openCatalogWechatDatabase(root, () => active)
  assert.ok(opened.db)
  assert.equal(opened.runId, 'run-0')
  opened.db?.close()

  const unavailable = openCatalogWechatDatabase(root, () => ({
    state: 'missing',catalog: null,products: null,status: {} as never,
  }))
  assert.equal(unavailable.db, null)
  assert.equal(unavailable.code, 'catalog_missing')
})

test('opens the artifact database from the same active catalog lease', (t) => {
  const root = fixtureRoot(t)
  const productRoot = path.join(root, 'data', 'products', 'assets', 'a'.repeat(64))
  fs.mkdirSync(productRoot, { recursive: true })
  const databasePath = path.join(productRoot, 'artifacts.db')
  const db = new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT,conv_id TEXT,message_uid TEXT,resource_message_id TEXT,resource_id TEXT,
      category TEXT,kind TEXT,name TEXT,preview TEXT,url TEXT,source_relative_path TEXT,
      source_size INTEGER,created_at INTEGER,sender_name TEXT,text TEXT,alignment_status TEXT,
      link_status TEXT,link_reason TEXT,candidate_message_uids TEXT,evidence_kind TEXT,
      evidence_signature TEXT,materialization TEXT,preview_status TEXT,failure_reason TEXT
    );
    CREATE TABLE asset_runs(
      run_id TEXT,status TEXT,completed_at TEXT,resources INTEGER,exact_alignments INTEGER,
      partial_alignments INTEGER,missing_alignments INTEGER,conflicting_alignments INTEGER,
      confirmed_links INTEGER,unconfirmed_links INTEGER,exported INTEGER,failed INTEGER,
      voice_attempts INTEGER
    );
    INSERT INTO asset_runs VALUES('asset-run','complete','2026-07-13T00:00:00.000Z',0,0,0,0,0,0,0,0,0,0);
  `)
  db.close()
  const stat = fs.statSync(databasePath)
  const manifest = {
    schemaVersion: 1 as const,kind: 'assets' as const,runId: 'asset-run',
    domainSchemaVersion: 2,
    createdAt: '2026-07-13T00:00:00.000Z',bundleSha256: `sha256:${'a'.repeat(64)}`,
    domainReceiptSha256: `sha256:${'b'.repeat(64)}`,entrypoints: { database: 'artifacts.db' },
    files: [{ relativePath: 'artifacts.db',size: stat.size,sha256: runtimeDigestFile(databasePath) }],
    dependencies: {},counts: {},
  }
  const active = {
    state: 'ready' as const,catalog: null,status: {} as never,
    products: { assets: { root: productRoot,manifest } },
  }
  const opened = openCatalogArtifactDatabase(root, () => active)
  assert.ok(opened.db)
  assert.equal(opened.bundleRoot, productRoot)
  opened.db?.close()
})
