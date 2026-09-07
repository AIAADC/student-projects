import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { findWxgfHevcPayloadOffset } from '../../shared/media/mediaMagic.js'
import { detectWechatMediaFormat } from './wechatDat.js'
import {
  digestBytes,
  mediaStagingPath,
  prepareMediaStaging,
  removeStagingFile,
  validateMediaAssetId,
} from './stagingFile.js'

export type FfmpegInvocation = {
  executable: 'ffmpeg'
  args: string[]
  cwd: string
  shell: false
  timeoutMs: number
}

export type FfmpegResult = { code: number }
export type FfmpegRunner = (invocation: FfmpegInvocation) => Promise<FfmpegResult>
type FfmpegChild = {
  kill: (signal?: NodeJS.Signals) => boolean
  once: {
    (event: 'error', listener: (error: Error) => void): unknown
    (event: 'close', listener: (code: number | null) => void): unknown
  }
}
type FfmpegChildFactory = (invocation: FfmpegInvocation) => FfmpegChild

type WxgfMaterializationResult =
  | {
    status: 'ready'
    relativePath: string
    size: number
    contentSha256: string
    format: 'jpeg'
  }
  | {
    status: 'unsupported_codec'
    reason: 'hevc_start_code_missing' | 'ffmpeg_unavailable' | 'ffmpeg_failed'
  }
  | {
    status: 'decrypt_failed'
    reason: 'invalid_output_magic'
  }

export function extractWxgfHevcPayload(bytes: Uint8Array): Buffer | null {
  const offset = findWxgfHevcPayloadOffset(bytes)
  return offset === null ? null : Buffer.from(bytes.subarray(offset))
}

const spawnFfmpegChild: FfmpegChildFactory = (invocation) => spawn(
  invocation.executable,
  invocation.args,
  {
      cwd: invocation.cwd,
      shell: invocation.shell,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
  },
)

function timeoutError() {
  return Object.assign(new Error('FFMPEG_TIMEOUT'), { code: 'ETIMEDOUT' })
}

export function createFfmpegProcessRunner(
  createChild: FfmpegChildFactory = spawnFfmpegChild,
  options: { killGraceMs?: number } = {},
): FfmpegRunner {
  const killGraceMs = options.killGraceMs ?? 1_000
  if (!Number.isSafeInteger(killGraceMs) || killGraceMs <= 0) {
    throw new RangeError('FFmpeg kill grace must be positive')
  }
  return (invocation) => new Promise((resolve, reject) => {
    const child = createChild(invocation)
    let settled = false
    let timedOut = false
    let forceTimer: NodeJS.Timeout | undefined
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (forceTimer) clearTimeout(forceTimer)
      action()
    }
    const timer = setTimeout(() => {
      timedOut = true
      try { child.kill() } catch { /* Escalation below remains authoritative. */ }
      forceTimer = setTimeout(() => {
        try { child.kill('SIGKILL') } catch { /* Wait for close/error after escalation. */ }
      }, killGraceMs)
    }, invocation.timeoutMs)
    child.once('error', (error) => finish(() => reject(timedOut ? timeoutError() : error)))
    child.once('close', (code) => finish(() => (
      timedOut ? reject(timeoutError()) : resolve({ code: code ?? -1 })
    )))
  })
}

export const runFfmpegProcess = createFfmpegProcessRunner()

export async function materializeWxgf(input: {
  assetId: string
  bytes: Uint8Array
  stagingDir: string
  runFfmpeg?: FfmpegRunner
  timeoutMs?: number
}): Promise<WxgfMaterializationResult> {
  const hevc = extractWxgfHevcPayload(input.bytes)
  if (!hevc) return { status: 'unsupported_codec', reason: 'hevc_start_code_missing' }
  validateMediaAssetId(input.assetId)
  const { root: stagingRoot } = prepareMediaStaging(input.stagingDir)
  const hevcPath = mediaStagingPath(stagingRoot, input.assetId, 'h265').absolutePath
  const jpeg = mediaStagingPath(stagingRoot, input.assetId, 'jpg')
  const jpegPath = jpeg.absolutePath
  removeStagingFile(hevcPath)
  removeStagingFile(jpegPath)
  fs.writeFileSync(hevcPath, hevc, { flag: 'wx' })

  const invocation: FfmpegInvocation = {
    executable: 'ffmpeg',
    args: [
      '-y', '-v', 'error', '-f', 'hevc', '-i', hevcPath,
      '-frames:v', '1', '-update', '1', jpegPath,
    ],
    cwd: stagingRoot,
    shell: false,
    timeoutMs: input.timeoutMs ?? 15_000,
  }
  try {
    const result = await (input.runFfmpeg ?? runFfmpegProcess)(invocation)
    if (result.code !== 0 || !fs.existsSync(jpegPath)) {
      removeStagingFile(jpegPath)
      return { status: 'unsupported_codec', reason: 'ffmpeg_failed' }
    }
    const stat = fs.lstatSync(jpegPath)
    const bytes = stat.isFile() && !stat.isSymbolicLink() ? fs.readFileSync(jpegPath) : Buffer.alloc(0)
    if (detectWechatMediaFormat(bytes) !== 'jpeg') {
      removeStagingFile(jpegPath)
      return { status: 'decrypt_failed', reason: 'invalid_output_magic' }
    }
    return {
      status: 'ready',
      relativePath: jpeg.relativePath,
      size: bytes.length,
      contentSha256: digestBytes(bytes),
      format: 'jpeg',
    }
  } catch (error) {
    removeStagingFile(jpegPath)
    return {
      status: 'unsupported_codec',
      reason: (error as NodeJS.ErrnoException)?.code === 'ENOENT'
        ? 'ffmpeg_unavailable'
        : 'ffmpeg_failed',
    }
  } finally {
    removeStagingFile(hevcPath)
  }
}
