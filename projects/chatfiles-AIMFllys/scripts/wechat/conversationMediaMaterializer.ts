import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { materializeConversationDatAssets } from '../../pipeline/media/conversationDatBundle.js'
import type { FfmpegRunner } from '../../pipeline/media/wxgfMaterializer.js'
import type { WechatMediaKeyProvider } from '../../pipeline/media/wechatDat.js'
import { fingerprintDirectory } from './assetBundleBinding.js'
import { createAssetRunReceipt, createMaterializationEvidenceDigest } from './assetRunReceipt.js'
import {
  assetBundleBindingFromRun,
  readConversationAssetMetrics,
} from './conversationAssetV2Audit.js'
import {
  assetIndexSchema,
  mediaJournalSchema,
  type AssetIndex,
  type MediaJournal,
} from './conversationMediaIndex.js'

function readJson(filename: string): unknown {
  const bytes = fs.readFileSync(filename)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/u, '')
  return JSON.parse(text)
}

function readIndex(filename: string): AssetIndex {
  try {
    return assetIndexSchema.parse(readJson(filename))
  } catch {
    throw new Error('MEDIA_INDEX_INVALID')
  }
}

function readJournal(filename: string): MediaJournal {
  try {
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('MEDIA_JOURNAL_INVALID')
    return mediaJournalSchema.parse(readJson(filename))
  } catch {
    throw new Error('MEDIA_JOURNAL_INVALID')
  }
}

function publishIndexFile(filename: string, serialized: string) {
  const temporary = `${filename}.tmp`
  const previous = `${filename}.previous`
  if (fs.existsSync(temporary) || fs.existsSync(previous)) throw new Error('MEDIA_INDEX_STAGING_EXISTS')
  fs.writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' })
  const handle = fs.openSync(temporary, 'r+')
  try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
  fs.renameSync(filename, previous)
  try {
    fs.renameSync(temporary, filename)
    fs.unlinkSync(previous)
  } catch (error) {
    try {
      if (!fs.existsSync(filename) && fs.existsSync(previous)) fs.renameSync(previous, filename)
    } catch { /* Recovery journal remains for the next invocation. */ }
    throw error
  }
}

function serializedIndex(index: AssetIndex | MediaJournal) {
  return `${JSON.stringify(index, null, 2)}\n`
}

function recoverIndexPublication(filename: string, journal: MediaJournal) {
  const temporary = `${filename}.tmp`
  const previous = `${filename}.previous`
  for (const candidate of [filename, temporary, previous]) {
    if (!fs.existsSync(candidate)) continue
    const stat = fs.lstatSync(candidate)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('MEDIA_INDEX_STAGING_INVALID')
  }
  if (!fs.existsSync(filename)) {
    if (fs.existsSync(previous)) fs.renameSync(previous, filename)
    else fs.writeFileSync(filename, serializedIndex(journal.baseIndex), { encoding: 'utf8', flag: 'wx' })
  }
  if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  if (fs.existsSync(previous)) fs.unlinkSync(previous)
}

function completeRun(database: DatabaseSync) {
  const rows = database.prepare(`SELECT * FROM asset_runs LIMIT 2`).all() as Array<Record<string, unknown>>
  const run = rows[0]
  if (rows.length !== 1 || !run || run.status !== 'complete' || Number(run.schema_version) !== 2) {
    throw new Error('MEDIA_ASSET_RUN_INVALID')
  }
  return run
}

function refreshRun(
  database: DatabaseSync,
  runId: string,
  metrics: ReturnType<typeof readConversationAssetMetrics>,
  receipt: string,
) {
  const result = database.prepare(`UPDATE asset_runs SET
    source_count=?,resource_count=?,asset_count=?,association_count=?,candidate_count=?,
    materialization_count=?,quarantined_count=?,exact_alignments=?,partial_alignments=?,
    missing_alignments=?,conflicting_alignments=?,confirmed_associations=?,unconfirmed_associations=?,
    ready_count=?,not_attempted_count=?,unavailable_count=?,voice_attempts=?,audit_receipt_sha256=?
    WHERE run_id=? AND status='complete'
  `).run(
    metrics.sources,metrics.resources,metrics.assets,metrics.associations,metrics.candidates,
    metrics.materializations,metrics.quarantined,metrics.exactAlignments,metrics.partialAlignments,
    metrics.missingAlignments,metrics.conflictingAlignments,metrics.confirmedAssociations,
    metrics.unconfirmedAssociations,metrics.ready,metrics.notAttempted,metrics.unavailable,
    metrics.voiceAttempts,receipt,runId,
  )
  if (Number(result.changes) !== 1) throw new Error('MEDIA_ASSET_RUN_REFRESH_FAILED')
}

export async function materializeConversationMediaBundle(input: {
  bundleDir: string
  accountRoot: string
  keyProvider: WechatMediaKeyProvider
  xorKey?: number
  concurrency: number
  runFfmpeg?: FfmpegRunner
  publishIndex?: (filename: string, serialized: string) => void
}) {
  const bundleLeaf = path.basename(path.resolve(input.bundleDir)).toLowerCase()
  if (bundleLeaf.includes('current')) throw new Error('MEDIA_CURRENT_BUNDLE_READ_ONLY')
  if (!bundleLeaf.endsWith('.next') && !bundleLeaf.includes('.staging')) {
    throw new Error('MEDIA_BUNDLE_ROLE_INVALID')
  }
  const bundleLeafStat = fs.lstatSync(input.bundleDir)
  if (!bundleLeafStat.isDirectory() || bundleLeafStat.isSymbolicLink()) {
    throw new Error('MEDIA_BUNDLE_PATH_UNSAFE')
  }
  const bundleDir = fs.realpathSync(input.bundleDir)
  const accountRoot = fs.realpathSync(input.accountRoot)
  const databasePath = path.join(bundleDir, 'artifacts.db')
  const indexPath = path.join(bundleDir, 'index.json')
  const journalPath = path.join(bundleDir, '.media-materialization.json')
  for (const filename of [databasePath]) {
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('MEDIA_BUNDLE_PATH_UNSAFE')
  }
  const existingJournal = fs.existsSync(journalPath) ? readJournal(journalPath) : null
  if (existingJournal) recoverIndexPublication(indexPath, existingJournal)
  const indexStat = fs.lstatSync(indexPath)
  if (!indexStat.isFile() || indexStat.isSymbolicLink()) throw new Error('MEDIA_BUNDLE_PATH_UNSAFE')
  const database = new DatabaseSync(databasePath)
  try {
    const run = completeRun(database)
    const binding = assetBundleBindingFromRun(run)
    if (binding.accountRootFingerprint !== fingerprintDirectory(accountRoot)) {
      throw new Error('MEDIA_ACCOUNT_ROOT_BINDING_MISMATCH')
    }
    let index: AssetIndex
    try {
      index = readIndex(indexPath)
    } catch (error) {
      if (!existingJournal) throw error
      index = existingJournal.baseIndex
    }
    if (index.runId !== String(run.run_id)
      || (existingJournal && existingJournal.runId !== String(run.run_id))) {
      throw new Error('MEDIA_INDEX_BINDING_MISMATCH')
    }
    if (index.receipt !== String(run.audit_receipt_sha256)) {
      if (!existingJournal) throw new Error('MEDIA_INDEX_BINDING_MISMATCH')
      const recoveredMetrics = readConversationAssetMetrics(database)
      const recoveredEvidence = createMaterializationEvidenceDigest(database)
      const recoveredReceipt = createAssetRunReceipt({
        runId: index.runId,completedAt: index.completedAt,binding,
        counts: index.counts,metrics: recoveredMetrics,
        materializationEvidenceSha256: recoveredEvidence,
      })
      if (recoveredReceipt !== String(run.audit_receipt_sha256)) {
        throw new Error('MEDIA_INDEX_BINDING_MISMATCH')
      }
      index = {
        ...index,binding,metrics: recoveredMetrics,
        materializationEvidenceSha256: recoveredEvidence,receipt: recoveredReceipt,
      }
      publishIndexFile(indexPath, serializedIndex(index))
    }
    if (!existingJournal) fs.writeFileSync(journalPath, serializedIndex({
      version: 1,runId: index.runId,status: 'started',baseIndex: index,
    }), { encoding: 'utf8', flag: 'wx' })
    const summary = await materializeConversationDatAssets({
      assetDb: database,
      accountRoot,
      bundleDir,
      keyProvider: input.keyProvider,
      xorKey: input.xorKey,
      concurrency: input.concurrency,
      runFfmpeg: input.runFfmpeg,
    })
    const metrics = readConversationAssetMetrics(database)
    const materializationEvidenceSha256 = createMaterializationEvidenceDigest(database)
    const receipt = createAssetRunReceipt({
      runId: index.runId,
      completedAt: index.completedAt,
      binding,
      counts: index.counts,
      metrics,
      materializationEvidenceSha256,
    })
    refreshRun(database, index.runId, metrics, receipt)
    database.exec('PRAGMA journal_mode=DELETE')
    const nextIndex: AssetIndex = {
      ...index,
      binding,
      metrics,
      materializationEvidenceSha256,
      receipt,
    }
    ;(input.publishIndex ?? publishIndexFile)(indexPath, serializedIndex(nextIndex))
    fs.unlinkSync(journalPath)
    return summary
  } finally {
    database.close()
  }
}
