import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { libraryManifestSchema } from '../../shared/contracts/files.js'
import {
  productReleaseReceiptSchema,
  type ProductKind,
  type ProductManifest,
} from '../../shared/contracts/productCatalog.js'
import { runtimeContained, runtimeDigestFile, runtimeJson } from './catalogRuntimeFiles.js'

type RuntimeProduct = { root: string;manifest: ProductManifest }

function file(product: RuntimeProduct, name: string, code: string) {
  const relativePath = product.manifest.entrypoints[name]
  const evidence = product.manifest.files.find((item) => item.relativePath === relativePath)
  if (!relativePath || !evidence) throw new Error(code)
  const target = path.resolve(product.root, ...relativePath.split('/'))
  const real = fs.realpathSync(target)
  const stat = fs.lstatSync(real)
  if (!runtimeContained(product.root, real) || !stat.isFile() || stat.isSymbolicLink()
    || stat.size !== evidence.size || runtimeDigestFile(real) !== evidence.sha256) throw new Error(code)
  return real
}

function receipt(product: RuntimeProduct) {
  const code = 'PRODUCT_RELEASE_RECEIPT_INVALID'
  const filename = file(product, 'release', code)
  const parsed = productReleaseReceiptSchema.parse(runtimeJson(filename, code))
  if (runtimeDigestFile(filename) !== product.manifest.domainReceiptSha256
    || parsed.kind !== product.manifest.kind || parsed.runId !== product.manifest.runId
    || parsed.domainSchemaVersion !== product.manifest.domainSchemaVersion
    || parsed.validatedAt !== product.manifest.createdAt
    || JSON.stringify(parsed.counts) !== JSON.stringify(product.manifest.counts)) throw new Error(code)
}

function databaseRun(
  product: RuntimeProduct,
  table: 'parse_runs' | 'asset_runs',
  requiredTables: readonly string[],
  code: string,
) {
  const database = new DatabaseSync(file(product, 'database', code), { readOnly: true })
  try {
    if (database.prepare('PRAGMA integrity_check').get()?.integrity_check !== 'ok') throw new Error(code)
    const tables = new Set((database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    ).all() as Array<{ name: string }>).map((row) => row.name))
    if (requiredTables.some((name) => !tables.has(name))) throw new Error(code)
    const runs = database.prepare(`SELECT * FROM ${table} LIMIT 2`).all() as Array<Record<string, unknown>>
    if (runs.length !== 1) throw new Error(code)
    return runs[0]!
  } finally { database.close() }
}

function validateWechat(product: RuntimeProduct) {
  const code = 'WECHAT_PRODUCT_DOMAIN_INVALID'
  const run = databaseRun(product, 'parse_runs', ['parse_runs','messages'], code)
  if (run.run_id !== product.manifest.runId || run.status !== 'complete'
    || Number(run.schema_version) !== product.manifest.domainSchemaVersion) throw new Error(code)
}

function validateAssets(product: RuntimeProduct) {
  const code = 'ASSET_PRODUCT_DOMAIN_INVALID'
  const run = databaseRun(product, 'asset_runs', [
    'asset_runs','asset_sources','asset_associations','asset_candidates','assets','asset_materializations',
  ], code)
  const dependency = product.manifest.dependencies.wechat
  if (!dependency || run.run_id !== product.manifest.runId || run.status !== 'complete'
    || Number(run.schema_version) !== product.manifest.domainSchemaVersion
    || run.canonical_run_id !== dependency.runId
    || run.canonical_database_sha256 !== dependency.entrypointSha256) throw new Error(code)
}

function validateLibrary(product: RuntimeProduct) {
  const code = 'LIBRARY_PRODUCT_DOMAIN_INVALID'
  libraryManifestSchema.parse(runtimeJson(file(product, 'manifest', code), code))
}

function validateInsights(product: RuntimeProduct) {
  const code = 'INSIGHT_PRODUCT_DOMAIN_INVALID'
  const value = runtimeJson(file(product, 'receipt', code), code) as Record<string, unknown>
  const manifest = runtimeJson(file(product, 'manifest', code), code)
  const state = runtimeJson(file(product, 'state', code), code)
  if (value.runId !== product.manifest.runId || value.status !== 'complete'
    || Number(value.version) !== product.manifest.domainSchemaVersion
    || !Array.isArray(manifest) || !Array.isArray(state)) throw new Error(code)
}

export function validateRuntimeProductDomain(kind: ProductKind, product: RuntimeProduct) {
  receipt(product)
  if (kind === 'wechat') validateWechat(product)
  else if (kind === 'assets') validateAssets(product)
  else if (kind === 'library') validateLibrary(product)
  else validateInsights(product)
}
