import fs from 'node:fs'
import {
  decryptWechatDat,
  detectWechatMediaFormat,
  useWechatMediaKey,
  type WechatMediaFormat,
  type WechatMediaKeyProvider,
} from './wechatDat.js'
import {
  digestBytes,
  mediaStagingPath,
  prepareMediaStaging,
  removeStagingFile,
  validateMediaAssetId,
} from './stagingFile.js'
import {
  materializeWxgf,
  type FfmpegRunner,
} from './wxgfMaterializer.js'

type ReadyMedia = {
  status: 'ready'
  relativePath: string
  size: number
  contentSha256: string
  format: Exclude<WechatMediaFormat, 'wxgf'>
}

export type DatMaterializationResult =
  | ReadyMedia
  | { status: 'key_unavailable' }
  | { status: 'decrypt_failed'; reason: string }
  | { status: 'unsupported_codec'; reason: string }

const EXTENSIONS: Readonly<Record<Exclude<WechatMediaFormat, 'wxgf'>, string>> = {
  jpeg: 'jpg',
  png: 'png',
  gif: 'gif',
  webp: 'webp',
}

function writeDecodedImage(input: {
  assetId: string
  bytes: Buffer
  format: Exclude<WechatMediaFormat, 'wxgf'>
  stagingDir: string
}): ReadyMedia {
  if (detectWechatMediaFormat(input.bytes) !== input.format) {
    throw new Error('MEDIA_MAGIC_CHANGED')
  }
  const { root } = prepareMediaStaging(input.stagingDir)
  const target = mediaStagingPath(root, input.assetId, EXTENSIONS[input.format])
  removeStagingFile(target.absolutePath)
  fs.writeFileSync(target.absolutePath, input.bytes, { flag: 'wx' })
  return {
    status: 'ready',
    relativePath: target.relativePath,
    size: input.bytes.length,
    contentSha256: digestBytes(input.bytes),
    format: input.format,
  }
}

export async function materializeWechatDat(input: {
  assetId: string
  encoded: Uint8Array
  stagingDir: string
  keyProvider: WechatMediaKeyProvider
  xorKey?: number
  runFfmpeg?: FfmpegRunner
}): Promise<DatMaterializationResult> {
  validateMediaAssetId(input.assetId)
  const initial = decryptWechatDat(input.encoded, { xorKey: input.xorKey })
  const decoded = initial.status === 'key_unavailable'
    ? await useWechatMediaKey(input.keyProvider, initial.version, (key) => (
      decryptWechatDat(input.encoded, { v2: key, xorKey: input.xorKey })
    ))
    : initial
  if (!decoded) return { status: 'key_unavailable' }
  if (decoded.status === 'key_unavailable') return { status: 'key_unavailable' }
  if (decoded.status === 'decrypt_failed') {
    return { status: 'decrypt_failed', reason: decoded.reason }
  }
  if (decoded.format === 'wxgf') {
    return materializeWxgf({
      assetId: input.assetId,
      bytes: decoded.bytes,
      stagingDir: input.stagingDir,
      runFfmpeg: input.runFfmpeg,
    })
  }
  return writeDecodedImage({
    assetId: input.assetId,
    bytes: decoded.bytes,
    format: decoded.format,
    stagingDir: input.stagingDir,
  })
}
