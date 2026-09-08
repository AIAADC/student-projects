import fs from 'node:fs'

export async function readBoundedUtf8Text(filePath: string, maximumBytes: number) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error('invalid_text_preview_limit')
  const handle = await fs.promises.open(filePath, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('text_preview_unavailable')
    if (stat.size > maximumBytes) throw new Error('text_preview_too_large')
    const bytes = Buffer.allocUnsafe(stat.size)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (bytesRead === 0) throw new Error('text_preview_truncated')
      offset += bytesRead
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('invalid_utf8_text')
    }
  } finally {
    await handle.close()
  }
}
