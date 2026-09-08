import crypto from 'node:crypto'
import {
  hasMaterializedMediaMagic,
  hasWxgfHevcPayload,
} from '../../shared/media/mediaMagic.js'

export type WechatDatVersion = 'v1' | 'v2'
export type WechatMediaFormat = 'jpeg' | 'png' | 'gif' | 'webp' | 'wxgf'

export type WechatDatResult =
  | {
    status: 'ready'
    version: WechatDatVersion | 'legacy_xor'
    format: WechatMediaFormat
    bytes: Buffer
  }
  | {
    status: 'key_unavailable'
    version: WechatDatVersion
  }
  | {
    status: 'decrypt_failed'
    version: WechatDatVersion | 'legacy_xor'
    reason: 'invalid_key' | 'invalid_padding' | 'truncated_payload' | 'cipher_failure' | 'invalid_media_magic'
  }

export type WechatMediaKeys = {
  v2?: Uint8Array
  xorKey?: number
}

export type WechatMediaKeyProvider = {
  provide: (version: WechatDatVersion) => Uint8Array | null | Promise<Uint8Array | null>
}

const HEADER_SIZE = 15
const DEFAULT_XOR_TAIL_KEY = 0x88
const V1_AES_KEY = 'cfcd208495d565ef'
const HEADERS: Readonly<Record<WechatDatVersion, Buffer>> = {
  v1: Buffer.from([0x07, 0x08, 0x56, 0x31, 0x08, 0x07]),
  v2: Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07]),
}

function startsWith(bytes: Uint8Array, magic: Uint8Array) {
  return bytes.length >= magic.length
    && magic.every((value, index) => bytes[index] === value)
}

export function detectWechatMediaFormat(bytes: Uint8Array): WechatMediaFormat | null {
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    && hasMaterializedMediaMagic(bytes, 'jpeg')) {
    return 'jpeg'
  }
  if (startsWith(bytes, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    && hasMaterializedMediaMagic(bytes, 'png')) {
    return 'png'
  }
  if (startsWith(bytes, Buffer.from('GIF87a', 'ascii'))
    || startsWith(bytes, Buffer.from('GIF89a', 'ascii'))) {
    return hasMaterializedMediaMagic(bytes, 'gif') ? 'gif' : null
  }
  if (bytes.length >= 12
    && startsWith(bytes, Buffer.from('RIFF', 'ascii'))
    && Buffer.from(bytes.subarray(8, 12)).equals(Buffer.from('WEBP', 'ascii'))) {
    return hasMaterializedMediaMagic(bytes, 'webp') ? 'webp' : null
  }
  if (startsWith(bytes, Buffer.from('wxgf', 'ascii'))) {
    return hasWxgfHevcPayload(bytes) ? 'wxgf' : null
  }
  return null
}

function datVersion(bytes: Uint8Array): WechatDatVersion | null {
  if (startsWith(bytes, HEADERS.v1)) return 'v1'
  if (startsWith(bytes, HEADERS.v2)) return 'v2'
  return null
}

function decryptVersioned(
  input: Uint8Array,
  version: WechatDatVersion,
  key: Uint8Array,
  xorKey: number,
): WechatDatResult {
  if (key.byteLength !== 16 || !Number.isInteger(xorKey) || xorKey < 0 || xorKey > 0xff) {
    return { status: 'decrypt_failed', reason: 'invalid_key', version }
  }
  if (input.byteLength < HEADER_SIZE) {
    return { status: 'decrypt_failed', reason: 'truncated_payload', version }
  }
  const encoded = Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  const aesSize = encoded.readUInt32LE(6)
  const xorSize = encoded.readUInt32LE(10)
  const encryptedSize = aesSize + (16 - (aesSize % 16))
  const encryptedEnd = HEADER_SIZE + encryptedSize
  const tailStart = encoded.length - xorSize
  if (aesSize <= 0 || encryptedEnd > tailStart || tailStart < HEADER_SIZE) {
    return { status: 'decrypt_failed', reason: 'truncated_payload', version }
  }

  let paddedPrefix: Buffer
  const keyBuffer = Buffer.from(key)
  try {
    const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuffer, null)
    decipher.setAutoPadding(false)
    paddedPrefix = Buffer.concat([
      decipher.update(encoded.subarray(HEADER_SIZE, encryptedEnd)),
      decipher.final(),
    ])
  } catch {
    return { status: 'decrypt_failed', reason: 'cipher_failure', version }
  } finally {
    keyBuffer.fill(0)
  }
  const paddingSize = paddedPrefix[paddedPrefix.length - 1] ?? 0
  const paddingStart = paddedPrefix.length - paddingSize
  if (paddingSize < 1 || paddingSize > 16 || paddingStart !== aesSize
    || !paddedPrefix.subarray(paddingStart).every((value) => value === paddingSize)) {
    return { status: 'decrypt_failed', reason: 'invalid_padding', version }
  }
  const decryptedPrefix = paddedPrefix.subarray(0, paddingStart)

  const middle = encoded.subarray(encryptedEnd, tailStart)
  const tail = Buffer.allocUnsafe(xorSize)
  for (let index = 0; index < xorSize; index++) tail[index] = encoded[tailStart + index]! ^ xorKey
  const bytes = Buffer.concat([decryptedPrefix, middle, tail])
  const format = detectWechatMediaFormat(bytes)
  if (!format) {
    return { status: 'decrypt_failed', reason: 'invalid_media_magic', version }
  }
  return { status: 'ready', version, format, bytes }
}

function decryptLegacyXor(input: Uint8Array): WechatDatResult {
  const signatures = [
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('GIF87a', 'ascii'),
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from('RIFF', 'ascii'),
  ]
  for (const signature of signatures) {
    if (input.length < signature.length) continue
    const key = input[0]! ^ signature[0]!
    if (!signature.every((value, index) => (input[index]! ^ key) === value)) continue
    const bytes = Buffer.allocUnsafe(input.length)
    for (let index = 0; index < input.length; index++) bytes[index] = input[index]! ^ key
    const format = detectWechatMediaFormat(bytes)
    if (format) return { status: 'ready', version: 'legacy_xor', format, bytes }
  }
  return { status: 'decrypt_failed', reason: 'invalid_media_magic', version: 'legacy_xor' }
}

export function decryptWechatDat(input: Uint8Array, keys: WechatMediaKeys): WechatDatResult {
  const version = datVersion(input)
  if (!version) return decryptLegacyXor(input)
  const key = version === 'v1' ? Buffer.from(V1_AES_KEY, 'ascii') : keys.v2
  if (!key) return { status: 'key_unavailable', version }
  return decryptVersioned(input, version, key, keys.xorKey ?? DEFAULT_XOR_TAIL_KEY)
}

export async function useWechatMediaKey<T>(
  provider: WechatMediaKeyProvider,
  version: WechatDatVersion,
  consumer: (key: Uint8Array) => T | Promise<T>,
): Promise<T | null> {
  const provided = await provider.provide(version)
  if (!provided) return null
  const delivered = Uint8Array.from(provided)
  try {
    return await consumer(delivered)
  } finally {
    delivered.fill(0)
    provided.fill(0)
  }
}
