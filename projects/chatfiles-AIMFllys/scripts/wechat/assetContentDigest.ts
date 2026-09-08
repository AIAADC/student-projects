import crypto from 'node:crypto'
import fs from 'node:fs'

const DEFAULT_CHUNK_SIZE = 1024 * 1024

export function digestFileContent(filename: string, chunkSize = DEFAULT_CHUNK_SIZE) {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new RangeError('chunkSize must be a positive safe integer')
  }
  const handle = fs.openSync(filename, 'r')
  const digest = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(chunkSize)
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
