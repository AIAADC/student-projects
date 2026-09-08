import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { VoicePreview } from '../../shared/contracts/index.js'
import { detectMaterializedVoiceFormat } from '../../shared/media/mediaMagic.js'
import { audioCacheDir } from './helpers.js'

export function isVoiceFile(filePath: string) {
  return /\.(amr|silk)$/i.test(path.extname(filePath))
}

export function voiceCodecHint(filePath: string) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(32)
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    const format = detectMaterializedVoiceFormat(buffer.subarray(0, bytesRead))
    if (format === 'silk') return 'QQ SILK_V3 voice payload'
    if (format === 'amr-wb') return 'AMR wideband'
    if (format === 'amr') return 'AMR narrowband'
    return undefined
  } finally {
    fs.closeSync(fd)
  }
}

function voiceCachePath(filePath: string) {
  const stat = fs.statSync(filePath)
  const key = crypto.createHash('sha1').update(`${filePath}|${stat.size}|${stat.mtimeMs}`).digest('hex')
  return path.join(audioCacheDir, `${key}.wav`)
}

function probeDurationSeconds(filePath: string) {
  try {
    const output = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, windowsHide: true },
    )
    const duration = Number(output.trim())
    return Number.isFinite(duration) ? duration : undefined
  } catch {
    return undefined
  }
}

export function transcodeVoice(filePath: string) {
  fs.mkdirSync(audioCacheDir, { recursive: true })
  const target = voiceCachePath(filePath)
  const resolvedTarget = path.resolve(target)
  const resolvedCache = path.resolve(audioCacheDir)
  if (!resolvedTarget.startsWith(`${resolvedCache}${path.sep}`)) throw new Error('Invalid audio cache path')
  if (!fs.existsSync(target)) {
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', filePath, '-ac', '1', '-ar', '16000', target], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
      windowsHide: true,
    })
  }
  return target
}

export function inspectVoice(filePath: string, transcodedUrl: string): VoicePreview {
  const stat = fs.statSync(filePath)
  const codecHint = voiceCodecHint(filePath)
  const base = {
    path: filePath,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    sourceFormat: path.extname(filePath).toLowerCase() || '[none]',
    codecHint,
    durationSeconds: codecHint === 'QQ SILK_V3 voice payload' ? undefined : probeDurationSeconds(filePath),
  }
  if (codecHint === 'QQ SILK_V3 voice payload') {
    return {
      ...base,
      playable: false,
      error: '检测到 QQ/微信常见的 SILK_V3 语音载荷；当前环境没有可用 SILK 解码器，已保留原文件并展示格式识别结果。',
    }
  }
  try {
    transcodeVoice(filePath)
    return {
      ...base,
      playable: true,
      transcodedUrl,
    }
  } catch (error) {
    return {
      ...base,
      playable: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
