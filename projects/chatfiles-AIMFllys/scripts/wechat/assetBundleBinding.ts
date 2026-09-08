import crypto from 'node:crypto'
import fs from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { discoverSourceDatabases } from '../../pipeline/wechat/sourceInventory.js'
import { digestFileContent } from './assetContentDigest.js'
import type { ConversationAssetSourceScope } from './conversationAssetSourceScope.js'

export type AssetBundleBinding = {
  owner: string
  sourceSnapshotId: string
  sourceSnapshotRootFingerprint: string
  accountRootFingerprint: string
  canonicalRunId: string
  canonicalSchemaVersion: number
  canonicalDatabaseSha256: string
  sourceManifestSha256: string
  resourceDatabaseSha256: string
}

function sha256(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function fingerprintDirectory(target: string) {
  const resolved = fs.realpathSync(target)
  if (!fs.statSync(resolved).isDirectory()) throw new Error('Binding root is not a directory')
  const canonical = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return sha256(`chatfiles-path-v1\0${canonical}`)
}

function canonicalRun(wechat: DatabaseSync) {
  const rows = wechat.prepare(`
    SELECT run_id,status,schema_version FROM parse_runs LIMIT 2
  `).all() as Array<{ run_id: string; status: string; schema_version: number }>
  if (rows.length !== 1 || rows[0]?.status !== 'complete') {
    throw new Error('Canonical database must contain one complete parse run')
  }
  const metadata = new Map((wechat.prepare('SELECT key,value FROM bundle_metadata').all() as Array<{
    key: string
    value: string
  }>).map((row) => [row.key, row.value]))
  const row = rows[0]
  if (metadata.get('run_id') !== row.run_id || Number(metadata.get('schema_version')) !== Number(row.schema_version)) {
    throw new Error('Canonical database metadata does not match its parse run')
  }
  return { runId: row.run_id, schemaVersion: Number(row.schema_version) }
}

function sourceManifestDigest(
  wechat: DatabaseSync,
  sourceSnapshotRoot: string,
  scope: ConversationAssetSourceScope,
) {
  const inventory = wechat.prepare(`
    SELECT domain,source_db,source_table,discovered_rows,parsed_rows,deduplicated_rows,
           excluded_rows,exclusion_reason
    FROM source_inventory WHERE source_snapshot=?
    ORDER BY domain,source_db,source_table
  `).all(scope.snapshotId)
  const discovered = discoverSourceDatabases(sourceSnapshotRoot)
  const byName = new Map(discovered.map((source) => [source.filename, source.absolutePath]))
  const files = scope.sourceDatabases.map((filename) => {
    const absolutePath = byName.get(filename)
    if (!absolutePath) throw new Error(`Source manifest shard is missing: ${filename}`)
    return { filename, sha256: digestFileContent(absolutePath) }
  })
  return sha256(JSON.stringify({ inventory, files }))
}

export function createAssetBundleBinding(input: {
  wechat: DatabaseSync
  wechatDbPath: string
  resourceDbPath: string
  sourceSnapshotRoot: string
  accountRoot: string
  sourceScope: ConversationAssetSourceScope
}): AssetBundleBinding {
  const run = canonicalRun(input.wechat)
  return {
    owner: input.sourceScope.owner,
    sourceSnapshotId: input.sourceScope.snapshotId,
    sourceSnapshotRootFingerprint: fingerprintDirectory(input.sourceSnapshotRoot),
    accountRootFingerprint: fingerprintDirectory(input.accountRoot),
    canonicalRunId: run.runId,
    canonicalSchemaVersion: run.schemaVersion,
    canonicalDatabaseSha256: digestFileContent(input.wechatDbPath),
    sourceManifestSha256: sourceManifestDigest(
      input.wechat,
      input.sourceSnapshotRoot,
      input.sourceScope,
    ),
    resourceDatabaseSha256: digestFileContent(input.resourceDbPath),
  }
}
