import crypto from 'node:crypto'
import fs from 'node:fs'

export function digestFileContent(filename: string) {
  const handle = fs.openSync(filename, 'r')
  const digest = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(handle)
  }
  return `sha256:${digest.digest('hex')}`
}

const digestCache = new Map<string, {
  size: number
  mtimeMs: number
  ctimeMs: number
  digest: string
}>()

export function cachedFileContentDigest(filename: string) {
  const stat = fs.statSync(filename)
  const cached = digestCache.get(filename)
  if (
    cached
    && cached.size === stat.size
    && cached.mtimeMs === stat.mtimeMs
    && cached.ctimeMs === stat.ctimeMs
  ) return cached.digest
  const digest = digestFileContent(filename)
  digestCache.set(filename, { size: stat.size,mtimeMs: stat.mtimeMs,ctimeMs: stat.ctimeMs,digest })
  if (digestCache.size > 32) digestCache.delete(digestCache.keys().next().value ?? '')
  return digest
}
