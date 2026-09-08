import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ProductManifest } from '../../shared/contracts/productCatalog.js'
import { auditInsightRefresh } from '../insights/insightRefreshAudit.js'
import { auditConversationAssetBundle } from '../wechat/conversationAssetAudit.js'
import { auditWechatDatabase } from '../wechat/chatAudit.js'
import { validateLibraryProductBundle } from './libraryProductAdapter.js'
import { productReceiptDigest, productRecord, readProductJson } from './productAdapterSupport.js'
import { digestFile, strictRealDirectory } from './productFiles.js'
import {
  assertAssetWechatDependency,
  assertInsightWechatDependency,
  wechatProductDependency,
} from './wechatProductDependency.js'

export {
  assertAssetWechatDependency,
  assertInsightWechatDependency,
  validateLibraryProductBundle,
  wechatProductDependency,
}

export type ProductReleaseMetadata = Pick<
  ProductManifest,
  'runId' | 'domainSchemaVersion' | 'createdAt' | 'domainReceiptSha256'
  | 'entrypoints' | 'dependencies' | 'counts'
>

export function validateWechatProductBundle(bundleDirInput: string): ProductReleaseMetadata {
  const bundleDir = strictRealDirectory(bundleDirInput, 'WECHAT_PRODUCT_ROOT_INVALID')
  const databasePath = path.join(bundleDir, 'wechat.db')
  const indexPath = path.join(bundleDir, 'index.json')
  const audit = auditWechatDatabase(databasePath)
  if (!audit.ok) throw new Error('WECHAT_PRODUCT_AUDIT_FAILED')
  const index = productRecord(readProductJson(indexPath), 'WECHAT_PRODUCT_INDEX_INVALID')
  const db = new DatabaseSync(databasePath, { readOnly: true })
  let run: Record<string, unknown>
  try {
    const rows = db.prepare('SELECT * FROM parse_runs LIMIT 2').all() as Array<Record<string, unknown>>
    if (rows.length !== 1) throw new Error('WECHAT_PRODUCT_RUN_INVALID')
    run = rows[0]!
  } finally {
    db.close()
  }
  if (run.status !== 'complete' || !String(run.run_id ?? '').trim()
    || index.runId !== run.run_id || Number(index.schemaVersion) !== Number(run.schema_version)) {
    throw new Error('WECHAT_PRODUCT_INDEX_INVALID')
  }
  const evidence = {
    databaseSha256: digestFile(databasePath),indexSha256: digestFile(indexPath),metrics: audit.metrics,
    runId: run.run_id,schemaVersion: run.schema_version,timeZone: run.time_zone,
  }
  return {
    runId: String(run.run_id),
    domainSchemaVersion: Number(run.schema_version),
    createdAt: String(run.completed_at),
    domainReceiptSha256: productReceiptDigest(evidence),
    entrypoints: { database: 'wechat.db',index: 'index.json' },
    dependencies: {},
    counts: audit.metrics,
  }
}

export function validateAssetProductBundle(input: {
  bundleDir: string
  accountRoot: string
  wechatManifest: ProductManifest
}): ProductReleaseMetadata {
  const bundleDir = strictRealDirectory(input.bundleDir, 'ASSET_PRODUCT_ROOT_INVALID')
  if (fs.existsSync(path.join(bundleDir, '.media-materialization.json'))) {
    throw new Error('ASSET_PRODUCT_MATERIALIZATION_INCOMPLETE')
  }
  const audit = auditConversationAssetBundle({ bundleDir,accountRoot: input.accountRoot })
  if (!audit.ok) throw new Error('ASSET_PRODUCT_AUDIT_FAILED')
  const databasePath = path.join(bundleDir, 'artifacts.db')
  const indexPath = path.join(bundleDir, 'index.json')
  const index = productRecord(readProductJson(indexPath), 'ASSET_PRODUCT_INDEX_INVALID')
  const db = new DatabaseSync(databasePath, { readOnly: true })
  let run: Record<string, unknown>
  try {
    const rows = db.prepare('SELECT * FROM asset_runs LIMIT 2').all() as Array<Record<string, unknown>>
    if (rows.length !== 1) throw new Error('ASSET_PRODUCT_RUN_INVALID')
    run = rows[0]!
  } finally {
    db.close()
  }
  if (run.status !== 'complete' || index.runId !== run.run_id) throw new Error('ASSET_PRODUCT_INDEX_INVALID')
  assertAssetWechatDependency(run, input.wechatManifest)
  return {
    runId: String(run.run_id),domainSchemaVersion: Number(run.schema_version),
    createdAt: String(run.completed_at),
    domainReceiptSha256: productReceiptDigest({
      databaseSha256: digestFile(databasePath),indexSha256: digestFile(indexPath),audit,
    }),
    entrypoints: { database: 'artifacts.db',index: 'index.json' },
    dependencies: { wechat: wechatProductDependency(input.wechatManifest) },
    counts: { ...audit.counts,...audit.metrics },
  }
}

export function validateInsightProductBundle(input: {
  root: string
  bundleDir: string
  wechatDatabasePath: string
  wechatManifest: ProductManifest
}): ProductReleaseMetadata {
  assertInsightWechatDependency(input.wechatDatabasePath, input.wechatManifest)
  const audit = auditInsightRefresh({
    root: input.root,bundleDir: input.bundleDir,databasePath: input.wechatDatabasePath,
  })
  if (!audit.ok) throw new Error('INSIGHT_PRODUCT_AUDIT_FAILED')
  const receiptPath = path.join(input.bundleDir, 'receipt.json')
  const receipt = productRecord(readProductJson(receiptPath), 'INSIGHT_RECEIPT_INVALID')
  if (receipt.status !== 'complete' || typeof receipt.runId !== 'string') {
    throw new Error('INSIGHT_RECEIPT_INVALID')
  }
  return {
    runId: receipt.runId,
    domainSchemaVersion: Number(receipt.version),
    createdAt: String(receipt.completedAt ?? receipt.boardedAt ?? receipt.preparedAt),
    domainReceiptSha256: productReceiptDigest({
      receiptSha256: digestFile(receiptPath),audit: audit.metrics,
    }),
    entrypoints: { receipt: 'receipt.json',manifest: '_manifest.json',state: '_state.json' },
    dependencies: { wechat: wechatProductDependency(input.wechatManifest) },
    counts: audit.metrics,
  }
}
