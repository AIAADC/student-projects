import path from 'node:path'
import { TextDecoder } from 'node:util'
import protobuf from 'protobufjs/minimal.js'

const { Reader } = protobuf

export type PackedInfoEvidence = {
  valid: boolean
  strings: string[]
  lookupEvidence: string[]
  filenames: string[]
}

const MAX_DEPTH = 6
const MAX_TEXT_BYTES = 16 * 1024
const HASH_PATTERN = /(?:^|[^0-9a-f])([0-9a-f]{32})(?=$|[^0-9a-f])/giu
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9][A-Za-z0-9._-]{0,15}$/u
const utf8 = new TextDecoder('utf-8', { fatal: true })

function appendUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value)
}

function evidenceText(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > MAX_TEXT_BYTES) return null
  try {
    const value = utf8.decode(bytes)
    if (!value || [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 0x1f || code === 0x7f
    })) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function merge(target: string[], values: readonly string[]) {
  for (const value of values) appendUnique(target, value)
}

function readPackedStrings(bytes: Uint8Array, depth: number): string[] {
  if (depth > MAX_DEPTH) return []
  const reader = Reader.create(bytes)
  const strings: string[] = []
  while (reader.pos < reader.len) {
    const tag = reader.uint32()
    const fieldNumber = tag >>> 3
    const wireType = tag & 7
    if (fieldNumber === 0) throw new RangeError('protobuf field zero')
    if (wireType !== 2) {
      reader.skipType(wireType)
      continue
    }

    const value = reader.bytes()
    const text = evidenceText(value)
    if (text !== null) appendUnique(strings, text)
    if (depth < MAX_DEPTH && value.length > 0) {
      try {
        merge(strings, readPackedStrings(value, depth + 1))
      } catch {
        // A length-delimited field may be raw bytes or text rather than a nested message.
      }
    }
  }
  return strings
}

function filenameFromEvidence(value: string) {
  if (/^https?:\/\//iu.test(value)) return null
  const normalized = value.replaceAll('/', '\\')
  const filename = path.win32.basename(normalized)
  if (
    !filename
    || filename === '.'
    || filename === '..'
    || filename.length > 260
    || !FILE_EXTENSION_PATTERN.test(filename)
  ) {
    return null
  }
  return filename
}

export function parsePackedInfoEvidence(
  value: Uint8Array | null | undefined,
): PackedInfoEvidence {
  if (value === null || value === undefined || value.byteLength === 0) {
    return { valid: true, strings: [], lookupEvidence: [], filenames: [] }
  }

  let strings: string[]
  try {
    strings = readPackedStrings(value, 0)
  } catch {
    return { valid: false, strings: [], lookupEvidence: [], filenames: [] }
  }

  const lookupEvidence: string[] = []
  const filenames: string[] = []
  for (const evidence of strings) {
    for (const match of evidence.matchAll(HASH_PATTERN)) {
      const hash = match[1]
      if (hash) appendUnique(lookupEvidence, hash.toLowerCase())
    }
    const filename = filenameFromEvidence(evidence)
    if (filename !== null) appendUnique(filenames, filename)
  }
  return { valid: true, strings, lookupEvidence, filenames }
}
