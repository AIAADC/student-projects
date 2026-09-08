import type { TimelineCursor } from '../../shared/contracts/chat.js'

export type LegacyTimelineCursor = { legacy: true; time: number; messageUid: string }
export type DecodedTimelineCursor = LegacyTimelineCursor | TimelineCursor

function validCursorText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\u0000')
}

export function encodeTimelineCursor(cursor: TimelineCursor) {
  return Buffer.from(
    JSON.stringify([cursor.version, cursor.runId, cursor.sequence, cursor.messageUid]),
    'utf8',
  ).toString('base64url')
}

export function decodeTimelineCursor(value: string | undefined): DecodedTimelineCursor | null {
  if (!value || value.length > 760 || !/^[A-Za-z0-9_-]+$/u.test(value)) return null
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!Array.isArray(decoded)) return null
    if (decoded.length === 2) {
      const [time, messageUid] = decoded
      if (!Number.isSafeInteger(time) || Number(time) < 0 || !validCursorText(messageUid)) return null
      return { legacy: true, time: Number(time), messageUid }
    }
    if (decoded.length !== 4 || decoded[0] !== 2) return null
    const [, runId, sequence, messageUid] = decoded
    if (!validCursorText(runId) || !Number.isSafeInteger(sequence) || Number(sequence) < 0 || !validCursorText(messageUid)) {
      return null
    }
    return { version: 2, runId, sequence: Number(sequence), messageUid }
  } catch {
    return null
  }
}
