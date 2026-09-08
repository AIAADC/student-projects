import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProductKind, ProductManifest } from '../../shared/contracts/productCatalog.js'
import { validateLibraryProductBundle } from './libraryProductAdapter.js'
import { strictRealDirectory } from './productFiles.js'
import { assertAssetWechatDependency } from './wechatProductDependency.js'

function productRoot(dataRoot: string, manifest: ProductManifest) {
  return strictRealDirectory(path.join(
    dataRoot,'products',manifest.kind,manifest.bundleSha256.slice('sha256:'.length),
  ), 'PRODUCT_DOMAIN_ROOT_INVALID')
}

function entrypoint(root: string, manifest: ProductManifest, name: string) {
  const relativePath = manifest.entrypoints[name]
  if (!relativePath) throw new Error(`${manifest.kind.toUpperCase()}_PRODUCT_DOMAIN_INVALID`)
  return path.join(root, ...relativePath.split('/'))
}

function readJson(filename: string, code: string): Record<string, unknown> | unknown[] {
  try {
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code)
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)))
    if (!value || typeof value !== 'object') throw new Error(code)
    return value as Record<string, unknown> | unknown[]
  } catch (error) {
    throw new Error(code, { cause: error })
  }
}

function databaseRun(
  filename: string,
  table: 'parse_runs' | 'asset_runs',
  requiredTables: readonly string[],
  code: string,
) {
  let database: DatabaseSync | undefined
  try {
    database = new DatabaseSync(filename, { readOnly: true })
    if (database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error(code)
    const tables = new Set((database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all() as Array<{ name: string }>).map((row) => row.name))
    if (requiredTables.some((name) => !tables.has(name))) throw new Error(code)
    const rows = database.prepare(`SELECT * FROM ${table} LIMIT 2`).all() as Array<Record<string, unknown>>
    if (rows.length !== 1) throw new Error(code)
    return rows[0]!
  } catch (error) {
    throw new Error(code, { cause: error })
  } finally {
    database?.close()
  }
}

function validateWechat(root: string, manifest: ProductManifest) {
  const code = 'WECHAT_PRODUCT_DOMAIN_INVALID'
  const run = databaseRun(
    entrypoint(root, manifest, 'database'),'parse_runs',['parse_runs','messages'],code,
  )
  const index = readJson(entrypoint(root, manifest, 'index'), code) as Record<string, unknown>
  if (run.run_id !== manifest.runId || run.status !== 'complete'
    || Number(run.schema_version) !== manifest.domainSchemaVersion
    || index.runId !== manifest.runId
    || Number(index.schemaVersion) !== manifest.domainSchemaVersion) throw new Error(code)
}

function validateAssets(
  root: string,
  manifest: ProductManifest,
  wechat: ProductManifest,
) {
  const code = 'ASSET_PRODUCT_DOMAIN_INVALID'
  const run = databaseRun(entrypoint(root, manifest, 'database'),'asset_runs',[
    'asset_runs','asset_sources','asset_associations','asset_candidates','assets','asset_materializations',
  ],code)
  const index = readJson(entrypoint(root, manifest, 'index'), code) as Record<string, unknown>
  if (run.run_id !== manifest.runId || run.status !== 'complete'
    || Number(run.schema_version) !== manifest.domainSchemaVersion
    || index.runId !== manifest.runId) throw new Error(code)
  assertAssetWechatDependency(run, wechat)
}

function validateLibrary(dataRoot: string, root: string, manifest: ProductManifest) {
  try {
    const metadata = validateLibraryProductBundle(root, path.dirname(dataRoot))
    if (metadata.runId !== manifest.runId
      || metadata.domainSchemaVersion !== manifest.domainSchemaVersion) throw new Error()
  } catch (error) {
    throw new Error('LIBRARY_PRODUCT_DOMAIN_INVALID', { cause: error })
  }
}

function validateInsights(root: string, manifest: ProductManifest) {
  const code = 'INSIGHT_PRODUCT_DOMAIN_INVALID'
  const receipt = readJson(entrypoint(root, manifest, 'receipt'), code) as Record<string, unknown>
  const index = readJson(entrypoint(root, manifest, 'manifest'), code)
  const state = readJson(entrypoint(root, manifest, 'state'), code)
  if (receipt.runId !== manifest.runId || receipt.status !== 'complete'
    || Number(receipt.version) !== manifest.domainSchemaVersion
    || !Array.isArray(index) || !Array.isArray(state)) throw new Error(code)
}

export function validateCatalogProductDomains(
  dataRoot: string,
  manifests: Record<ProductKind, ProductManifest>,
) {
  for (const kind of ['wechat','assets','library','insights'] as const) {
    validateCatalogProductDomain(dataRoot, kind, manifests[kind], manifests)
  }
}

export function validateCatalogProductDomain(
  dataRoot: string,
  kind: ProductKind,
  manifest: ProductManifest,
  manifests: Partial<Record<ProductKind, ProductManifest>>,
) {
  const root = productRoot(dataRoot, manifest)
  if (kind === 'wechat') validateWechat(root, manifest)
  else if (kind === 'assets') {
    if (!manifests.wechat) throw new Error('PRODUCT_DEPENDENCY_MISSING')
    validateAssets(root, manifest, manifests.wechat)
  } else if (kind === 'library') validateLibrary(dataRoot, root, manifest)
  else validateInsights(root, manifest)
}
