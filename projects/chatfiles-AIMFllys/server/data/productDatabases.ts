import { DatabaseSync } from 'node:sqlite'
import { validArtifactDatabase } from '../wechat/artifactDatabase.js'
import { canonicalV2Schema, validateCanonicalV2 } from '../wechat/canonicalDatabaseValidation.js'
import {
  readActiveProductSet,
  resolveActiveEntrypoint,
  type ActiveProductSet,
} from './catalogReader.js'

export type CatalogDatabaseCode =
  | 'ready'
  | 'catalog_missing'
  | 'catalog_invalid'
  | 'recovery_required'
  | 'product_unavailable'
  | 'invalid_database'

function schemaAvailable(db: DatabaseSync) {
  for (const [table, columns] of Object.entries(canonicalV2Schema)) {
    const available = new Set((db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{
      name: string
    }>).map((row) => row.name))
    if (columns.some((column) => !available.has(column))) return false
  }
  return true
}

function unavailableCode(active: ActiveProductSet): CatalogDatabaseCode {
  if (active.state === 'missing') return 'catalog_missing'
  if (active.state === 'recovery_required') return 'recovery_required'
  if (active.state === 'invalid') return 'catalog_invalid'
  return 'product_unavailable'
}

export function openCatalogWechatDatabase(
  projectRoot: string,
  readActive: (root: string) => ActiveProductSet = readActiveProductSet,
) {
  const active = readActive(projectRoot)
  if (active.state !== 'ready' || !active.products?.wechat) {
    return { db: null,code: unavailableCode(active),sourcePath: null,runId: null,active }
  }
  let db: DatabaseSync | null = null
  try {
    const sourcePath = resolveActiveEntrypoint(active, 'wechat', 'database')
    db = new DatabaseSync(sourcePath, { readOnly: true })
    const issue = schemaAvailable(db) ? validateCanonicalV2(db) : 'invalid schema'
    const runs = issue ? [] : db.prepare('SELECT run_id FROM parse_runs LIMIT 2').all() as Array<{
      run_id: string
    }>
    if (issue || runs.length !== 1 || runs[0]?.run_id !== active.products.wechat.manifest.runId) {
      db.close()
      return { db: null,code: 'invalid_database' as const,sourcePath: null,runId: null,active }
    }
    return { db,code: 'ready' as const,sourcePath,runId: runs[0].run_id,active }
  } catch {
    try { db?.close() } catch { /* Rejected databases never remain leased. */ }
    return { db: null,code: 'invalid_database' as const,sourcePath: null,runId: null,active }
  }
}

export function openCatalogArtifactDatabase(
  projectRoot: string,
  readActive: (root: string) => ActiveProductSet = readActiveProductSet,
) {
  const active = readActive(projectRoot)
  if (active.state !== 'ready' || !active.products?.assets) {
    return {
      db: null,code: unavailableCode(active),sourcePath: null,bundleRoot: null,runId: null,active,
    }
  }
  let db: DatabaseSync | null = null
  try {
    const sourcePath = resolveActiveEntrypoint(active, 'assets', 'database')
    db = new DatabaseSync(sourcePath, { readOnly: true })
    const runs = validArtifactDatabase(db)
      ? db.prepare('SELECT run_id FROM asset_runs LIMIT 2').all() as Array<{ run_id: string }>
      : []
    if (runs.length !== 1 || runs[0]?.run_id !== active.products.assets.manifest.runId) {
      db.close()
      return {
        db: null,code: 'invalid_database' as const,sourcePath: null,bundleRoot: null,runId: null,active,
      }
    }
    return {
      db,code: 'ready' as const,sourcePath,
      bundleRoot: active.products.assets.root,runId: runs[0].run_id,active,
    }
  } catch {
    try { db?.close() } catch { /* Rejected databases never remain leased. */ }
    return {
      db: null,code: 'invalid_database' as const,sourcePath: null,bundleRoot: null,runId: null,active,
    }
  }
}
