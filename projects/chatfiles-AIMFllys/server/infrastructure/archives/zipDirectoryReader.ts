import fs from 'node:fs'

import type { ArchivePreviewBlockedReason } from '../../../shared/contracts/archivePreview.js'
import { isSafeArchiveEntryName } from '../../domain/files/archiveEntryName.js'

export type ZipDirectoryLimits = {
  maxArchiveBytes: number
  maxEntries: number
  maxDirectoryReadMs: number
  maxExpandedBytes: number
  maxCentralDirectoryBytes: number
}

export type RandomAccessByteSource = {
  size: number
  read: (offset: number, length: number, signal?: AbortSignal) => Promise<Uint8Array>
}

export type ZipDirectoryEntry = { name: string; size: number; directory: boolean }
export type ZipDirectoryResult =
  | { readable: true; entries: ZipDirectoryEntry[] }
  | { readable: false; entries: []; blockedReason?: ArchivePreviewBlockedReason; error?: string }

type ReaderOptions = { now?: () => number; signal?: AbortSignal }

const EOCD_SIGNATURE = 0x0605_4b50
const CENTRAL_SIGNATURE = 0x0201_4b50
const MAX_EOCD_BYTES = 65_557

function blocked(blockedReason: ArchivePreviewBlockedReason): ZipDirectoryResult {
  return { readable: false, entries: [], blockedReason }
}

function malformed(error: string): ZipDirectoryResult {
  return { readable: false, entries: [], error }
}

function validLimits(limits: ZipDirectoryLimits) {
  return Object.values(limits).every((value) => Number.isSafeInteger(value) && value > 0)
}

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

function findEocd(bytes: Uint8Array) {
  const data = view(bytes)
  for (let offset = bytes.byteLength - 22; offset >= 0; offset -= 1) {
    if (data.getUint32(offset, true) !== EOCD_SIGNATURE) continue
    const commentLength = data.getUint16(offset + 20, true)
    if (offset + 22 + commentLength === bytes.byteLength) return offset
  }
  return -1
}

function decodeName(bytes: Uint8Array, utf8: boolean) {
  const encoding = utf8 ? 'utf-8' : 'latin1'
  const value = new TextDecoder(encoding, { fatal: utf8 }).decode(bytes)
  if (!isSafeArchiveEntryName(value)) throw new Error('invalid_zip_entry_name')
  return value
}

function timedOut(startedAt: number, limits: ZipDirectoryLimits, now: () => number) {
  return now() - startedAt > limits.maxDirectoryReadMs
}

async function readBounded(
  source: RandomAccessByteSource,
  offset: number,
  length: number,
  signal: AbortSignal | undefined,
) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0
    || offset + length > source.size) throw new Error('invalid_zip_range')
  const bytes = await source.read(offset, length, signal)
  if (bytes.byteLength !== length) throw new Error('truncated_zip_range')
  return bytes
}

function parseEntries(
  bytes: Uint8Array,
  expectedEntries: number,
  limits: ZipDirectoryLimits,
  startedAt: number,
  now: () => number,
): ZipDirectoryResult {
  const data = view(bytes)
  const entries: ZipDirectoryEntry[] = []
  let expandedBytes = 0
  let offset = 0
  while (entries.length < expectedEntries) {
    if (timedOut(startedAt, limits, now)) return blocked('archive_directory_timeout')
    if (offset + 46 > bytes.byteLength || data.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      return malformed('invalid_zip_central_directory')
    }
    const flags = data.getUint16(offset + 8, true)
    const compressedSize = data.getUint32(offset + 20, true)
    const uncompressedSize = data.getUint32(offset + 24, true)
    const nameLength = data.getUint16(offset + 28, true)
    const extraLength = data.getUint16(offset + 30, true)
    const commentLength = data.getUint16(offset + 32, true)
    const localOffset = data.getUint32(offset + 42, true)
    if ([compressedSize, uncompressedSize, localOffset].includes(0xffff_ffff)) {
      return blocked('archive_expanded_size_limit_exceeded')
    }
    const next = offset + 46 + nameLength + extraLength + commentLength
    if (next > bytes.byteLength) return malformed('truncated_zip_central_directory')
    expandedBytes += uncompressedSize
    if (!Number.isSafeInteger(expandedBytes) || expandedBytes > limits.maxExpandedBytes) {
      return blocked('archive_expanded_size_limit_exceeded')
    }
    let name: string
    try {
      name = decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength), Boolean(flags & 0x0800))
    } catch {
      return malformed('invalid_zip_entry_name')
    }
    entries.push({ name, size: uncompressedSize, directory: name.endsWith('/') })
    offset = next
  }
  if (offset !== bytes.byteLength) return malformed('invalid_zip_central_directory_size')
  return { readable: true, entries }
}

export async function readZipDirectory(
  source: RandomAccessByteSource,
  limits: ZipDirectoryLimits,
  options: ReaderOptions = {},
): Promise<ZipDirectoryResult> {
  if (!Number.isSafeInteger(source.size) || source.size < 0 || !validLimits(limits)) {
    return malformed('invalid_zip_reader_configuration')
  }
  if (source.size > limits.maxArchiveBytes) return blocked('archive_file_too_large')
  const now = options.now ?? Date.now
  const startedAt = now()
  try {
    const tailLength = Math.min(source.size, MAX_EOCD_BYTES)
    const tail = await readBounded(source, source.size - tailLength, tailLength, options.signal)
    if (timedOut(startedAt, limits, now)) return blocked('archive_directory_timeout')
    const eocdOffset = findEocd(tail)
    if (eocdOffset < 0) return malformed('zip_eocd_not_found')
    const eocd = view(tail)
    const disk = eocd.getUint16(eocdOffset + 4, true)
    const directoryDisk = eocd.getUint16(eocdOffset + 6, true)
    const diskEntries = eocd.getUint16(eocdOffset + 8, true)
    const entryCount = eocd.getUint16(eocdOffset + 10, true)
    const directorySize = eocd.getUint32(eocdOffset + 12, true)
    const directoryOffset = eocd.getUint32(eocdOffset + 16, true)
    if (disk !== 0 || directoryDisk !== 0 || diskEntries !== entryCount
      || entryCount === 0xffff || directorySize === 0xffff_ffff || directoryOffset === 0xffff_ffff) {
      return malformed('unsupported_multi_disk_or_zip64')
    }
    if (entryCount > limits.maxEntries) return blocked('archive_entry_limit_exceeded')
    if (directorySize > limits.maxCentralDirectoryBytes) return blocked('archive_directory_too_large')
    const directory = await readBounded(source, directoryOffset, directorySize, options.signal)
    if (timedOut(startedAt, limits, now)) return blocked('archive_directory_timeout')
    return parseEntries(directory, entryCount, limits, startedAt, now)
  } catch {
    if (options.signal?.aborted) return blocked('archive_directory_timeout')
    return malformed('zip_directory_failed')
  }
}

async function readFileRange(
  handle: fs.promises.FileHandle,
  offset: number,
  length: number,
  signal?: AbortSignal,
) {
  const buffer = Buffer.allocUnsafe(length)
  let filled = 0
  while (filled < length) {
    if (signal?.aborted) throw new Error('archive_directory_timeout')
    const { bytesRead } = await handle.read(buffer, filled, length - filled, offset + filled)
    if (bytesRead === 0) break
    filled += bytesRead
  }
  return buffer.subarray(0, filled)
}

export async function readZipDirectoryFile(
  filePath: string,
  limits: ZipDirectoryLimits,
  options: ReaderOptions = {},
) {
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    return await readZipDirectory({
      size: stat.size,
      read: async (offset, length, signal) => await readFileRange(handle, offset, length, signal),
    }, limits, options)
  } finally {
    await handle.close()
  }
}
