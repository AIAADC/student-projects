import fs from 'node:fs'
import path from 'node:path'
import { digestText } from './productFiles.js'

export function readProductJson(filename: string): unknown {
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PRODUCT_JSON_UNSAFE')
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)))
  } catch (error) {
    throw new Error('PRODUCT_JSON_INVALID', { cause: error })
  }
}

export function productRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code)
  return value as Record<string, unknown>
}

export function productReceiptDigest(value: unknown) {
  return digestText(JSON.stringify(value))
}

export function containedPath(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
