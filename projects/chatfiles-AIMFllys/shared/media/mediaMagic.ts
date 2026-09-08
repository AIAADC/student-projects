export type MaterializedMediaFormat =
  | 'jpeg'
  | 'png'
  | 'gif'
  | 'webp'
  | 'silk'
  | 'amr'
  | 'amr-wb'

function startsWith(bytes: Uint8Array, magic: readonly number[]) {
  return bytes.length >= magic.length
    && magic.every((value, index) => bytes[index] === value)
}

function endsWith(bytes: Uint8Array, magic: readonly number[]) {
  const offset = bytes.length - magic.length
  return offset >= 0 && magic.every((value, index) => bytes[offset + index] === value)
}

function ascii(bytes: Uint8Array, value: string, offset = 0) {
  if (bytes.length < offset + value.length) return false
  for (let index = 0; index < value.length; index++) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function littleEndianU32(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return null
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)) >>> 0
}

function littleEndianU16(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 2) return null
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function bigEndianU16(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 2) return null
  return (bytes[offset]! << 8) | bytes[offset + 1]!
}

function bigEndianU32(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return null
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16)
    | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
}

const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value
  for (let bit = 0; bit < 8; bit++) crc = (crc & 1) !== 0
    ? 0xedb88320 ^ (crc >>> 1)
    : crc >>> 1
  return crc >>> 0
})

function crc32(bytes: Uint8Array, start: number, end: number) {
  let crc = 0xffffffff
  for (let index = start; index < end; index++) {
    crc = CRC32_TABLE[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function scanJpegEntropy(bytes: Uint8Array, start: number) {
  let offset = start
  let sawEntropy = false
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      sawEntropy = true
      offset++
      continue
    }
    const markerStart = offset
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset]
    if (marker === undefined) return null
    if (marker === 0x00) {
      sawEntropy = true
      offset++
      continue
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      offset++
      continue
    }
    if (marker === 0xd9) {
      return sawEntropy && offset === bytes.length - 1
        ? { complete: true, next: bytes.length }
        : null
    }
    return sawEntropy ? { complete: false, next: markerStart } : null
  }
  return null
}

function validJpeg(bytes: Uint8Array) {
  if (!startsWith(bytes, [0xff,0xd8]) || !endsWith(bytes, [0xff,0xd9])) return false
  let offset = 2
  let sawFrame = false
  let sawScan = false
  while (offset < bytes.length - 2) {
    if (bytes[offset++] !== 0xff) return false
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === undefined || marker === 0x00 || marker === 0xd8) return false
    if (marker === 0xd9) return sawFrame && sawScan && offset === bytes.length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const size = bigEndianU16(bytes, offset)
    if (size === null || size < 2 || offset + size > bytes.length - 2) return false
    const payload = offset + 2
    const isFrame = marker >= 0xc0 && marker <= 0xcf
      && !new Set([0xc4,0xc8,0xcc]).has(marker)
    if (isFrame) {
      const height = bigEndianU16(bytes, payload + 1)
      const width = bigEndianU16(bytes, payload + 3)
      const components = bytes[payload + 5]
      if (!components || size !== 8 + (3 * components) || !height || !width) return false
      sawFrame = true
    }
    if (marker === 0xda) {
      const components = bytes[payload]
      if (!sawFrame || !components || size !== 6 + (2 * components)) return false
      const scan = scanJpegEntropy(bytes, offset + size)
      if (!scan) return false
      sawScan = true
      if (scan.complete) return true
      offset = scan.next
      continue
    }
    offset += size
  }
  return false
}

function validPng(bytes: Uint8Array) {
  if (!startsWith(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return false
  let offset = 8
  let sawHeader = false
  let dataSize = 0
  while (offset + 12 <= bytes.length) {
    const size = bigEndianU32(bytes, offset)
    if (size === null || offset + 12 + size > bytes.length) return false
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
    const data = offset + 8
    const end = offset + 12 + size
    if (bigEndianU32(bytes, end - 4) !== crc32(bytes, offset + 4, end - 4)) return false
    if (!sawHeader) {
      if (type !== 'IHDR' || size !== 13 || !bigEndianU32(bytes, data)
        || !bigEndianU32(bytes, data + 4)) return false
      sawHeader = true
    } else if (type === 'IDAT') {
      dataSize += size
    } else if (type === 'IEND') return size === 0 && dataSize > 0 && end === bytes.length
    offset = end
  }
  return false
}

function skipGifSubBlocks(bytes: Uint8Array, start: number, requirePayload = false) {
  let offset = start
  let payloadSize = 0
  while (offset < bytes.length) {
    const size = bytes[offset++]!
    if (size === 0) return !requirePayload || payloadSize > 0 ? offset : null
    if (offset + size > bytes.length) return null
    payloadSize += size
    offset += size
  }
  return null
}

function validGif(bytes: Uint8Array) {
  if (!(ascii(bytes, 'GIF87a') || ascii(bytes, 'GIF89a')) || bytes.length < 14) return false
  if (!littleEndianU16(bytes, 6) || !littleEndianU16(bytes, 8)) return false
  let offset = 13
  if ((bytes[10]! & 0x80) !== 0) offset += 3 * (2 ** ((bytes[10]! & 0x07) + 1))
  let sawImage = false
  while (offset < bytes.length) {
    const block = bytes[offset++]!
    if (block === 0x3b) return sawImage && offset === bytes.length
    if (block === 0x21) {
      if (offset >= bytes.length) return false
      offset = skipGifSubBlocks(bytes, offset + 1) ?? -1
    } else if (block === 0x2c) {
      if (offset + 9 > bytes.length || !littleEndianU16(bytes, offset + 4)
        || !littleEndianU16(bytes, offset + 6)) return false
      const packed = bytes[offset + 8]!
      offset += 9
      if ((packed & 0x80) !== 0) offset += 3 * (2 ** ((packed & 0x07) + 1))
      if (offset >= bytes.length || bytes[offset]! < 2 || bytes[offset]! > 8) return false
      offset = skipGifSubBlocks(bytes, offset + 1, true) ?? -1
      sawImage = true
    } else return false
    if (offset < 0) return false
  }
  return false
}

function validWebpImageChunk(bytes: Uint8Array, type: string, data: number, size: number) {
  if (type === 'VP8L') {
    return size >= 5 && bytes[data] === 0x2f && (bytes[data + 4]! & 0xe0) === 0
  }
  if (type !== 'VP8 ') return false
  const width = littleEndianU16(bytes, data + 6)
  const height = littleEndianU16(bytes, data + 8)
  return size >= 10 && bytes[data + 3] === 0x9d
    && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a
    && Boolean(width && (width & 0x3fff)) && Boolean(height && (height & 0x3fff))
}

function validWebpAnimationFrame(bytes: Uint8Array, data: number, size: number) {
  if (size < 24) return false
  const end = data + size
  let offset = data + 16
  let sawImage = false
  while (offset + 8 <= end) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const childSize = littleEndianU32(bytes, offset + 4)
    if (childSize === null || offset + 8 + childSize > end) return false
    sawImage ||= validWebpImageChunk(bytes, type, offset + 8, childSize)
    offset += 8 + childSize + (childSize % 2)
  }
  return sawImage && offset === end
}

function validWebp(bytes: Uint8Array) {
  if (!ascii(bytes, 'RIFF') || !ascii(bytes, 'WEBP', 8)
    || littleEndianU32(bytes, 4) !== bytes.length - 8) return false
  let offset = 12
  let sawImage = false
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const size = littleEndianU32(bytes, offset + 4)
    if (size === null || offset + 8 + size > bytes.length) return false
    const data = offset + 8
    sawImage ||= validWebpImageChunk(bytes, type, data, size)
      || (type === 'ANMF' && validWebpAnimationFrame(bytes, data, size))
    offset += 8 + size + (size % 2)
  }
  return sawImage && offset === bytes.length
}

export function findWxgfHevcPayloadOffset(bytes: Uint8Array) {
  if (!ascii(bytes, 'wxgf')) return null
  for (let index = 4; index < bytes.length - 6; index++) {
    if (bytes[index] === 0 && bytes[index + 1] === 0
      && bytes[index + 2] === 0 && bytes[index + 3] === 1) {
      const first = bytes[index + 4]!
      const second = bytes[index + 5]!
      if ((first & 0x80) === 0 && (second & 0x07) !== 0) return index
    }
  }
  return null
}

export function hasWxgfHevcPayload(bytes: Uint8Array) {
  return findWxgfHevcPayloadOffset(bytes) !== null
}

export function detectMaterializedVoiceFormat(bytes: Uint8Array) {
  const offset = bytes[0] === 0x02 ? 1 : 0
  if (ascii(bytes, '#!SILK_V3', offset)) return 'silk' as const
  if (ascii(bytes, '#!AMR-WB\n', offset)) return 'amr-wb' as const
  if (ascii(bytes, '#!AMR\n', offset)) return 'amr' as const
  return null
}

export function hasMaterializedMediaMagic(bytes: Uint8Array, format: string) {
  if (format === 'jpeg') {
    return validJpeg(bytes)
  }
  if (format === 'png') {
    return validPng(bytes)
  }
  if (format === 'gif') return validGif(bytes)
  if (format === 'webp') return validWebp(bytes)
  if (format === 'silk' || format === 'amr' || format === 'amr-wb') {
    return detectMaterializedVoiceFormat(bytes) === format
  }
  return false
}
