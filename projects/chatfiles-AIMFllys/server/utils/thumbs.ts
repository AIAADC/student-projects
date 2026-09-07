import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { root } from './helpers.js'

// On-disk thumbnail cache — the project's equivalent of a phone's thumbnail
// store. Originals are never streamed into the media grid; instead ffmpeg (the
// same binary used for voice transcoding) downscales each image to a small WebP
// and grabs a single poster frame from each video. Cached by content identity so
// a given source is only ever transcoded once.
export const thumbCacheDir = path.join(root, 'work', 'thumb-cache')

const MIN_W = 96
const MAX_W = 512

function clampWidth(width: number) {
  if (!Number.isFinite(width)) return 360
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(width)))
}

function cachePath(kind: 'img' | 'vid', filePath: string, width: number) {
  const stat = fs.statSync(filePath)
  const key = crypto
    .createHash('sha1')
    .update(`${kind}|${filePath}|${stat.size}|${stat.mtimeMs}|${width}`)
    .digest('hex')
  return path.join(thumbCacheDir, `${key}.webp`)
}

function ensureInsideCache(target: string) {
  const resolvedTarget = path.resolve(target)
  const resolvedCache = path.resolve(thumbCacheDir)
  if (!resolvedTarget.startsWith(`${resolvedCache}${path.sep}`)) throw new Error('Invalid thumb cache path')
  return resolvedTarget
}

function hasOutput(target: string) {
  try {
    return fs.statSync(target).size > 0
  } catch {
    return false
  }
}

function scaleFilter(width: number) {
  // never upscale; keep aspect; force even height for the encoder
  return `scale='min(${width},iw)':-2:flags=lanczos`
}

function runFfmpeg(args: string[]) {
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 25000, windowsHide: true })
}

/** Downscale an image to a cached WebP thumbnail. Returns the cache path. */
export function imageThumb(filePath: string, width: number) {
  const w = clampWidth(width)
  fs.mkdirSync(thumbCacheDir, { recursive: true })
  const target = ensureInsideCache(cachePath('img', filePath, w))
  if (hasOutput(target)) return target
  runFfmpeg(['-y', '-v', 'error', '-i', filePath, '-frames:v', '1', '-vf', scaleFilter(w), '-c:v', 'libwebp', '-quality', '72', target])
  return target
}

/** Grab a single poster frame from a video as a cached WebP. Returns the cache path. */
export function videoPoster(filePath: string, width: number) {
  const w = clampWidth(width)
  fs.mkdirSync(thumbCacheDir, { recursive: true })
  const target = ensureInsideCache(cachePath('vid', filePath, w))
  if (hasOutput(target)) return target
  const grab = (seek: string) =>
    runFfmpeg(['-y', '-v', 'error', '-ss', seek, '-i', filePath, '-frames:v', '1', '-vf', scaleFilter(w), '-c:v', 'libwebp', '-quality', '72', target])
  // fast-seek 1s in for a representative frame; fall back to frame 0 for short clips
  try {
    grab('1')
  } catch {
    /* clip shorter than 1s, retry from the start */
  }
  if (!hasOutput(target)) grab('0')
  return target
}
