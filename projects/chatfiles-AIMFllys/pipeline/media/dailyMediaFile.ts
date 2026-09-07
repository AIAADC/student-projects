import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { detectWechatMediaFormat } from './wechatDat.js'
import { digestBytes } from './stagingFile.js'

export type DailyMediaLimits = {
  maxImageBytes: number
}

export type PreparedDailyMediaFile = {
  sourcePath: string
  size: number
  contentSha256: string
  extension: string
  image: boolean
}

const DEFAULT_LIMITS: DailyMediaLimits = { maxImageBytes: 128 * 1024 * 1024 }
const DIGEST_BUFFER_BYTES = 64 * 1024
const VIDEO_HEADER_BYTES = 12

export function resolveDailyMediaLimits(
  limits: Partial<DailyMediaLimits> | undefined,
): DailyMediaLimits {
  const result = { ...DEFAULT_LIMITS,...limits }
  if (!Number.isSafeInteger(result.maxImageBytes) || result.maxImageBytes <= 0) {
    throw new Error('DAILY_MEDIA_LIMITS_INVALID')
  }
  return result
}

function contained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function safeSegments(relativePath: string) {
  if (!relativePath || relativePath.includes('\0')
    || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return null
  const segments = relativePath.split(/[\\/]/u)
  return segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))
    ? null
    : segments
}

function verifiedSourcePath(
  root: string,
  relativePath: string,
  size: number,
  contentSha256: string,
) {
  const segments = safeSegments(relativePath)
  if (!segments || !Number.isSafeInteger(size) || size < 0
    || !/^sha256:[a-f0-9]{64}$/u.test(contentSha256)) {
    throw new Error('DAILY_MEDIA_EVIDENCE_INVALID')
  }
  const lexical = path.resolve(root, ...segments)
  if (!contained(root, lexical)) throw new Error('DAILY_MEDIA_PATH_UNSAFE')
  let sourcePath: string
  try {
    sourcePath = fs.realpathSync(lexical)
  } catch {
    throw new Error('DAILY_MEDIA_SOURCE_MISSING')
  }
  if (!contained(root, sourcePath)) throw new Error('DAILY_MEDIA_PATH_UNSAFE')
  const stat = fs.lstatSync(sourcePath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== size) {
    throw new Error('DAILY_MEDIA_CONTENT_CHANGED')
  }
  return sourcePath
}

function inspectStream(filename: string) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(DIGEST_BUFFER_BYTES)
  const header = Buffer.alloc(VIDEO_HEADER_BYTES)
  let headerLength = 0
  const handle = fs.openSync(filename, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead))
        const copied = Math.min(bytesRead, header.length - headerLength)
        if (copied > 0) {
          buffer.copy(header, headerLength, 0, copied)
          headerLength += copied
        }
      }
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(handle)
  }
  return {
    contentSha256: `sha256:${hash.digest('hex')}`,
    header: header.subarray(0, headerLength),
  }
}

function readVideoHeader(filename: string) {
  const header = Buffer.alloc(VIDEO_HEADER_BYTES)
  const handle = fs.openSync(filename, 'r')
  try {
    const bytesRead = fs.readSync(handle, header, 0, header.length, 0)
    return header.subarray(0, bytesRead)
  } finally {
    fs.closeSync(handle)
  }
}

function isVideoContainer(header: Uint8Array) {
  if (header.length >= 12 && Buffer.from(header.subarray(4, 8)).toString('ascii') === 'ftyp') return true
  if (header.length >= 4 && Buffer.from(header.subarray(0, 4)).equals(
    Buffer.from([0x1a,0x45,0xdf,0xa3]),
  )) return true
  return header.length >= 12
    && Buffer.from(header.subarray(0, 4)).toString('ascii') === 'RIFF'
    && Buffer.from(header.subarray(8, 12)).toString('ascii') === 'AVI '
}

function imageFormat(filename: string, size: number, expectedDigest: string, maxBytes: number) {
  if (size > maxBytes) throw new Error('DAILY_MEDIA_IMAGE_LIMIT_EXCEEDED')
  const bytes = fs.readFileSync(filename)
  if (bytes.length !== size || digestBytes(bytes) !== expectedDigest) {
    throw new Error('DAILY_MEDIA_CONTENT_CHANGED')
  }
  const format = detectWechatMediaFormat(bytes)
  if (!format || format === 'wxgf') throw new Error('DAILY_MEDIA_MAGIC_INVALID')
  return format === 'jpeg' ? 'jpg' : format
}

export function prepareDailyMediaFile(input: {
  root: string
  relativePath: string
  size: number
  contentSha256: string
  preview: 'image' | 'video'
  name: string
  limits: DailyMediaLimits
}): PreparedDailyMediaFile {
  const sourcePath = verifiedSourcePath(
    input.root,input.relativePath,input.size,input.contentSha256,
  )
  if (input.preview === 'video' && isVideoContainer(readVideoHeader(sourcePath))) {
    const inspected = inspectStream(sourcePath)
    if (inspected.contentSha256 !== input.contentSha256
      || !isVideoContainer(inspected.header)) {
      throw new Error('DAILY_MEDIA_CONTENT_CHANGED')
    }
    const namedExtension = path.extname(input.name).slice(1).toLowerCase()
    const extension = /^(?:mp4|mov|webm|mkv|avi)$/u.test(namedExtension)
      ? namedExtension
      : 'mp4'
    return {
      sourcePath,size: input.size,contentSha256: input.contentSha256,extension,image: false,
    }
  }
  const extension = imageFormat(
    sourcePath,input.size,input.contentSha256,input.limits.maxImageBytes,
  )
  return { sourcePath,size: input.size,contentSha256: input.contentSha256,extension,image: true }
}

export function copyVerifiedDailyMediaFile(file: PreparedDailyMediaFile, destination: string) {
  fs.copyFileSync(file.sourcePath, destination, fs.constants.COPYFILE_EXCL)
  const stat = fs.lstatSync(destination)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size
    || inspectStream(destination).contentSha256 !== file.contentSha256) {
    throw new Error('DAILY_MEDIA_CONTENT_CHANGED')
  }
}
