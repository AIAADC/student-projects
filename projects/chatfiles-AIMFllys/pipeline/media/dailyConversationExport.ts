import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { formatArchiveTimestamp } from '../../shared/time/archiveTime.js'
import {
  copyVerifiedDailyMediaFile,
  prepareDailyMediaFile,
  resolveDailyMediaLimits,
  type DailyMediaLimits,
} from './dailyMediaFile.js'

type MessageRow = {
  message_uid: string
  canonical_seq: number
  occurred_at_epoch_s: number
  archive_day: string
  sender_name: string
  text: string
}

type ArtifactRow = {
  asset_id: string
  message_uid: string
  name: string
  preview: string
  materialization: string
  preview_status: string
  materialized_relative_path: string | null
  materialized_size: number | null
  materialized_content_sha256: string | null
  media_format: string | null
  source_relative_path: string | null
  source_size: number | null
  source_content_sha256: string | null
}

function contained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function sameOrContained(parent: string, child: string) {
  return parent === child || contained(parent, child)
}

function canonicalProtectedRoot(root: string) {
  const stat = fs.lstatSync(root)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('DAILY_MEDIA_ROOT_UNSAFE')
  return fs.realpathSync(root)
}

function canonicalFuturePath(filename: string) {
  const missing: string[] = []
  let ancestor = path.resolve(filename)
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor)
    if (parent === ancestor) throw new Error('DAILY_MEDIA_OUTPUT_UNSAFE')
    missing.unshift(path.basename(ancestor))
    ancestor = parent
  }
  const stat = fs.lstatSync(ancestor)
  if (!stat.isDirectory()) throw new Error('DAILY_MEDIA_OUTPUT_UNSAFE')
  return path.resolve(fs.realpathSync(ancestor), ...missing)
}

function markdownText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\r\n]+/gu, ' ')
    .replaceAll(']', '\\]')
    .trim()
}

function timeZone(database: DatabaseSync) {
  const row = database.prepare("SELECT value FROM bundle_metadata WHERE key='time_zone'").get() as {
    value?: string
  } | undefined
  if (!row?.value) throw new Error('DAILY_MEDIA_TIME_ZONE_MISSING')
  return row.value
}

export function exportDailyConversationMedia(input: {
  canonicalDb: DatabaseSync
  assetDb: DatabaseSync
  bundleRoot: string
  accountRoot?: string
  conversationId: string
  outputRoot: string
  limits?: Partial<DailyMediaLimits>
}) {
  const limits = resolveDailyMediaLimits(input.limits)
  if (fs.existsSync(input.outputRoot)) throw new Error('DAILY_MEDIA_OUTPUT_EXISTS')
  const bundleRoot = canonicalProtectedRoot(input.bundleRoot)
  const accountRoot = input.accountRoot ? canonicalProtectedRoot(input.accountRoot) : null
  const outputRoot = canonicalFuturePath(input.outputRoot)
  if (sameOrContained(bundleRoot, outputRoot)
    || (accountRoot && sameOrContained(accountRoot, outputRoot))) {
    throw new Error('DAILY_MEDIA_OUTPUT_PROTECTED')
  }
  const outputParent = path.dirname(outputRoot)
  const outputLeaf = path.basename(outputRoot)
  if (!outputLeaf || outputRoot === outputParent) throw new Error('DAILY_MEDIA_OUTPUT_UNSAFE')
  fs.mkdirSync(outputParent, { recursive: true })
  const stagingRoot = path.join(outputParent, `.${outputLeaf}.${process.pid}.staging`)
  if (fs.existsSync(stagingRoot)) throw new Error('DAILY_MEDIA_STAGING_EXISTS')
  const messages = input.canonicalDb.prepare(`
    SELECT message_uid,canonical_seq,occurred_at_epoch_s,archive_day,sender_name,text
    FROM messages WHERE conv_id=? ORDER BY canonical_seq
  `).all(input.conversationId) as MessageRow[]
  const artifacts = input.assetDb.prepare(`
    SELECT asset_id,message_uid,name,preview,materialization,preview_status,
           materialized_relative_path,materialized_size,materialized_content_sha256,media_format,
           source_relative_path,source_size,source_content_sha256
    FROM artifacts
    WHERE conv_id=? AND association_status='exact' AND confirmation_status='confirmed'
      AND (
        (materialization='ready' AND preview_status='ready')
        OR (materialization='thumbnail_only' AND preview_status='thumbnail_only')
      )
      AND (lower(coalesce(source_relative_path,'')) NOT LIKE '%.dat'
        OR materialized_relative_path IS NOT NULL)
    ORDER BY message_uid,asset_id
  `).all(input.conversationId) as ArtifactRow[]
  const artifactsByMessage = new Map<string, ArtifactRow[]>()
  for (const artifact of artifacts) {
    const values = artifactsByMessage.get(artifact.message_uid) ?? []
    values.push(artifact)
    artifactsByMessage.set(artifact.message_uid, values)
  }
  const zone = timeZone(input.canonicalDb)
  fs.mkdirSync(stagingRoot)
  try {
    const linesByDay = new Map<string, string[]>()
    let photos = 0
    let videos = 0
    for (const message of messages) {
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(message.archive_day)) throw new Error('DAILY_MEDIA_DAY_INVALID')
      const dayDir = path.join(stagingRoot, message.archive_day)
      fs.mkdirSync(dayDir, { recursive: true })
      const lines = linesByDay.get(message.archive_day) ?? [`# ${message.archive_day}`, '']
      lines.push(`- ${formatArchiveTimestamp(Number(message.occurred_at_epoch_s), zone)} ${markdownText(message.sender_name)}`)
      lines.push(`  ${markdownText(message.text)}`)
      for (const artifact of artifactsByMessage.get(message.message_uid) ?? []) {
        if (artifact.preview !== 'image' && artifact.preview !== 'video') continue
        const materialized = artifact.materialized_relative_path !== null
        const root = materialized ? bundleRoot : accountRoot
        const relative = materialized ? artifact.materialized_relative_path : artifact.source_relative_path
        const size = materialized ? artifact.materialized_size : artifact.source_size
        const digest = materialized
          ? artifact.materialized_content_sha256
          : artifact.source_content_sha256
        if (!root || !relative || size === null || !digest) continue
        const format = prepareDailyMediaFile({
          root,relativePath: relative,size: Number(size),contentSha256: digest,
          preview: artifact.preview,name: artifact.name,limits,
        })
        const isVideo = artifact.preview === 'video'
        const folder = isVideo ? 'videos' : 'photos'
        const thumbnail = isVideo && (artifact.materialization === 'thumbnail_only' || format.image)
        const filename = `${artifact.asset_id}${thumbnail ? '-thumbnail' : ''}.${format.extension}`
        const folderPath = path.join(dayDir, folder)
        fs.mkdirSync(folderPath, { recursive: true })
        copyVerifiedDailyMediaFile(format, path.join(folderPath, filename))
        lines.push(`  ${format.image ? '!' : ''}[${markdownText(artifact.name)}](${folder}/${filename})`)
        if (isVideo) videos++
        else photos++
      }
      lines.push('')
      linesByDay.set(message.archive_day, lines)
    }
    for (const [day, lines] of linesByDay) {
      fs.writeFileSync(path.join(stagingRoot, day, 'chat.md'), `${lines.join('\n')}\n`, 'utf8')
    }
    fs.renameSync(stagingRoot, outputRoot)
    return { days: linesByDay.size,messages: messages.length,photos,videos }
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true })
    throw error
  }
}
