import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { hasMaterializedMediaMagic } from '../../shared/media/mediaMagic.js'
import { mapWithConcurrency } from './boundedWorkers.js'
import { digestBytes } from './stagingFile.js'
import {
  materializeWechatDat,
  type DatMaterializationResult,
} from './datMaterializer.js'
import type { FfmpegRunner } from './wxgfMaterializer.js'
import type { WechatMediaKeyProvider } from './wechatDat.js'

type DatTask = {
  source_id: string
  asset_id: string
  preview: string
  source_relative_path: string | null
  source_size: number | null
  source_content_sha256: string | null
  status: string
  materialized_relative_path: string | null
  materialized_size: number | null
  materialized_content_sha256: string | null
  media_format: string | null
}

type TaskResult = {
  task: DatTask
  result: DatMaterializationResult | {
    status: 'source_missing' | 'source_changed' | 'source_oversized' | 'unchanged'
  }
}

const REQUIRED_MATERIALIZATION_COLUMNS = [
  'materialized_relative_path', 'materialized_size', 'materialized_content_sha256', 'media_format',
] as const
const dosDevice = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu
const DEFAULT_MAX_DAT_BYTES = 128 * 1024 * 1024

function assertSchema(database: DatabaseSync) {
  const columns = new Set((database.prepare("PRAGMA table_info('asset_materializations')").all() as Array<{
    name: string
  }>).map((row) => row.name))
  if (REQUIRED_MATERIALIZATION_COLUMNS.some((column) => !columns.has(column))) {
    throw new Error('MEDIA_BUNDLE_SCHEMA_UNSUPPORTED')
  }
}

function safeSegments(relativePath: string) {
  if (!relativePath || relativePath.includes('\0')) return null
  if (path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null
  const segments = relativePath.split(/[\\/]/u)
  if (segments.some((segment) => !segment || segment === '.' || segment === '..'
    || segment.includes(':') || segment.endsWith('.') || segment.endsWith(' ')
    || dosDevice.test(segment))) {
    return null
  }
  return segments
}

function contained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function readBoundSource(accountRoot: string, task: DatTask, maxSourceBytes: number) {
  const segments = task.source_relative_path ? safeSegments(task.source_relative_path) : null
  if (!segments) return { status: 'source_missing' as const }
  try {
    const lexical = path.resolve(accountRoot, ...segments)
    if (!contained(accountRoot, lexical)) return { status: 'source_missing' as const }
    const real = fs.realpathSync(lexical)
    if (!contained(accountRoot, real)) return { status: 'source_missing' as const }
    const stat = fs.lstatSync(real)
    if (!stat.isFile() || stat.isSymbolicLink()) return { status: 'source_missing' as const }
    if (stat.size > maxSourceBytes) return { status: 'source_oversized' as const }
    if (task.source_size === null || stat.size !== Number(task.source_size)) {
      return { status: 'source_changed' as const }
    }
    const bytes = fs.readFileSync(real)
    if (!/^sha256:[a-f0-9]{64}$/u.test(task.source_content_sha256 ?? '')
      || digestBytes(bytes) !== task.source_content_sha256) {
      return { status: 'source_changed' as const }
    }
    return { status: 'ready' as const, bytes }
  } catch {
    return { status: 'source_missing' as const }
  }
}

function readTasks(database: DatabaseSync) {
  return database.prepare(`
    SELECT s.source_id,a.asset_id,a.preview,s.source_relative_path,s.source_size,
           s.source_content_sha256,m.status,m.materialized_relative_path,m.materialized_size,
           m.materialized_content_sha256,m.media_format
    FROM asset_sources s
    JOIN asset_associations aa ON aa.source_id=s.source_id
    JOIN assets a ON a.association_id=aa.association_id
    JOIN asset_materializations m ON m.source_id=s.source_id
    WHERE s.source_kind='resource'
      AND lower(s.source_relative_path) LIKE '%.dat'
      AND aa.association_status='exact'
      AND aa.confirmation_status='confirmed'
      AND aa.quarantined=0
    ORDER BY a.asset_id
  `).all() as DatTask[]
}

function hasVerifiedMaterialization(bundleDir: string, task: DatTask) {
  const segments = task.materialized_relative_path
    ? safeSegments(task.materialized_relative_path)
    : null
  if (!segments || task.materialized_size === null
    || !Number.isSafeInteger(Number(task.materialized_size))
    || !/^sha256:[a-f0-9]{64}$/u.test(task.materialized_content_sha256 ?? '')
    || !/^(?:jpeg|png|gif|webp)$/u.test(task.media_format ?? '')) return false
  try {
    const lexical = path.resolve(bundleDir, ...segments)
    if (!contained(bundleDir, lexical)) return false
    const real = fs.realpathSync(lexical)
    if (!contained(bundleDir, real)) return false
    const stat = fs.lstatSync(real)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Number(task.materialized_size)) {
      return false
    }
    const bytes = fs.readFileSync(real)
    return digestBytes(bytes) === task.materialized_content_sha256
      && hasMaterializedMediaMagic(bytes, task.media_format!)
  } catch {
    return false
  }
}

function updateMaterializations(database: DatabaseSync, results: readonly TaskResult[]) {
  const update = database.prepare(`
    UPDATE asset_materializations SET
      status=?,preview_status=?,failure_reason=?,materialized_relative_path=?,materialized_size=?,
      materialized_content_sha256=?,media_format=?
    WHERE source_id=? AND asset_id=?
  `)
  const updateSource = database.prepare('UPDATE asset_sources SET presence=? WHERE source_id=?')
  database.exec('BEGIN IMMEDIATE')
  try {
    for (const { task, result } of results) {
      if (result.status === 'unchanged') continue
      const sourcePresence = result.status === 'source_missing'
        ? 'missing'
        : result.status === 'source_oversized' ? 'oversized'
        : result.status === 'source_changed' ? 'content_mismatch' : 'present'
      updateSource.run(sourcePresence, task.source_id)
      if (result.status === 'ready') {
        const thumbnailOnly = task.preview === 'video'
          && ['jpeg', 'png', 'gif', 'webp'].includes(result.format)
        update.run(
          thumbnailOnly ? 'thumbnail_only' : 'ready',
          thumbnailOnly ? 'thumbnail_only' : 'ready',
          null,result.relativePath,result.size,result.contentSha256,result.format,
          task.source_id,task.asset_id,
        )
      } else {
        const materialization = result.status === 'source_changed' || result.status === 'source_oversized'
          ? 'not_attempted'
          : result.status
        const reason = result.status === 'source_changed' || result.status === 'source_oversized'
          ? result.status === 'source_changed' ? 'source_content_changed' : 'source_size_limit_exceeded'
          : 'reason' in result ? result.reason : result.status
        update.run(
          materialization,'unavailable',reason,
          null,null,null,null,task.source_id,task.asset_id,
        )
      }
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export async function materializeConversationDatAssets(input: {
  assetDb: DatabaseSync
  accountRoot: string
  bundleDir: string
  keyProvider: WechatMediaKeyProvider
  xorKey?: number
  concurrency: number
  maxSourceBytes?: number
  runFfmpeg?: FfmpegRunner
}) {
  assertSchema(input.assetDb)
  const accountRoot = fs.realpathSync(input.accountRoot)
  const bundleDir = fs.realpathSync(input.bundleDir)
  const maxSourceBytes = input.maxSourceBytes ?? DEFAULT_MAX_DAT_BYTES
  if (!Number.isSafeInteger(maxSourceBytes) || maxSourceBytes <= 0) {
    throw new Error('MEDIA_SOURCE_LIMIT_INVALID')
  }
  if (!fs.statSync(accountRoot).isDirectory() || !fs.statSync(bundleDir).isDirectory()) {
    throw new Error('MEDIA_ROOT_INVALID')
  }
  const tasks = readTasks(input.assetDb)
  const results = await mapWithConcurrency(tasks, input.concurrency, async (task): Promise<TaskResult> => {
    const source = readBoundSource(accountRoot, task, maxSourceBytes)
    if (source.status !== 'ready') return { task, result: source }
    if ((task.status === 'ready' || task.status === 'thumbnail_only')
      && hasVerifiedMaterialization(bundleDir, task)) {
      return { task, result: { status: 'unchanged' } }
    }
    return {
      task,
      result: await materializeWechatDat({
        assetId: task.asset_id,
        encoded: source.bytes,
        stagingDir: bundleDir,
        keyProvider: input.keyProvider,
        xorKey: input.xorKey,
        runFfmpeg: input.runFfmpeg,
      }),
    }
  })
  updateMaterializations(input.assetDb, results)
  const attempted = results.filter((result) => result.result.status !== 'unchanged')
  const ready = attempted.filter((result) => result.result.status === 'ready').length
  return { attempted: attempted.length, ready, failed: attempted.length - ready }
}
