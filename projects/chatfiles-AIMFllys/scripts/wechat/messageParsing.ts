import zlib from 'node:zlib'

import {
  messageTypeLabel,
  parseMessageContent,
} from '../../pipeline/wechat/messageTypeRegistry.js'

const utf8Decoder = new TextDecoder('utf-8', { fatal: true })

export function strictUtf8(buffer: Uint8Array, context: string) {
  try {
    return utf8Decoder.decode(buffer)
  } catch {
    throw new Error(`Invalid UTF-8 in ${context}`)
  }
}

export function decodeContent(value: unknown, context: string): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) {
    const buffer = Buffer.from(value)
    if (buffer.length >= 4 && buffer[0] === 0x28 && buffer[1] === 0xb5 && buffer[2] === 0x2f && buffer[3] === 0xfd) {
      try {
        return strictUtf8(zlib.zstdDecompressSync(buffer), context)
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('Invalid UTF-8')) throw error
        throw new Error(`Unable to decompress zstd content in ${context}`, { cause: error })
      }
    }
    return strictUtf8(buffer, context)
  }
  return String(value)
}

export function typeLabel(type: number): string {
  return messageTypeLabel(type)
}

export function extractText(type: number, content: string, isGroup: boolean) {
  const parsed = parseMessageContent(type, content, isGroup)
  return { senderPrefix: parsed.senderPrefix, text: parsed.text }
}

export function contactDisplayName(
  username: string,
  nickName: string,
  remark: string,
  alias: string,
) {
  return remark.trim() || nickName.trim() || alias.trim() || username.trim()
}
