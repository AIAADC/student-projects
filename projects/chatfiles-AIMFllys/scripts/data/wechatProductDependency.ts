import { DatabaseSync } from 'node:sqlite'
import type { ProductManifest } from '../../shared/contracts/productCatalog.js'
import { digestFile } from './productFiles.js'

export function wechatDatabaseEvidence(manifest: Pick<
  ProductManifest,
  'runId' | 'bundleSha256' | 'entrypoints' | 'files'
>) {
  const entrypoint = manifest.entrypoints.database
  const file = manifest.files.find((candidate) => candidate.relativePath === entrypoint)
  if (!entrypoint || !file) throw new Error('WECHAT_PRODUCT_ENTRYPOINT_INVALID')
  return { entrypoint,file }
}

export function assertAssetWechatDependency(
  run: Record<string, unknown>,
  manifest: ProductManifest,
) {
  const { file } = wechatDatabaseEvidence(manifest)
  if (run.canonical_run_id !== manifest.runId
    || run.canonical_database_sha256 !== file.sha256) {
    throw new Error('ASSET_PRODUCT_WECHAT_DEPENDENCY_MISMATCH')
  }
}

export function assertInsightWechatDependency(
  databasePath: string,
  manifest: ProductManifest,
) {
  const { file } = wechatDatabaseEvidence(manifest)
  const database = new DatabaseSync(databasePath, { readOnly: true })
  try {
    const runs = database.prepare('SELECT run_id FROM parse_runs LIMIT 2').all() as Array<{
      run_id: string
    }>
    if (runs.length !== 1 || runs[0]?.run_id !== manifest.runId
      || digestFile(databasePath) !== file.sha256) {
      throw new Error('INSIGHT_PRODUCT_WECHAT_DEPENDENCY_MISMATCH')
    }
  } finally { database.close() }
}

export function wechatProductDependency(manifest: Pick<
  ProductManifest,
  'runId' | 'domainSchemaVersion' | 'domainReceiptSha256'
  | 'bundleSha256' | 'entrypoints' | 'files'
>) {
  const { entrypoint,file } = wechatDatabaseEvidence(manifest)
  return {
    bundleSha256: manifest.bundleSha256,entrypoint,entrypointSha256: file.sha256,
    runId: manifest.runId,domainSchemaVersion: manifest.domainSchemaVersion,
    domainReceiptSha256: manifest.domainReceiptSha256,
  }
}
