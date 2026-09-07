import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const BUFFER_BYTES = 1024 * 1024

export function runtimeDigestText(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`
}

export function runtimeDigestFile(filename: string) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(BUFFER_BYTES)
  const handle = fs.openSync(filename, 'r')
  try {
    let read = 0
    do {
      read = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (read > 0) hash.update(buffer.subarray(0, read))
    } while (read > 0)
  } finally {
    fs.closeSync(handle)
  }
  return `sha256:${hash.digest('hex')}`
}

export function runtimeDirectory(candidate: string, code: string) {
  const lexical = path.resolve(candidate)
  const stat = fs.lstatSync(lexical)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code)
  return fs.realpathSync(lexical)
}

export function runtimeJson(filename: string, code: string): unknown {
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(code)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)))
  } catch (error) {
    throw new Error(code, { cause: error })
  }
}

export function runtimeContained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
