import fs from 'node:fs'
import { libraryManifestSchema } from '../../shared/contracts/files.js'
import {
  resolveActiveEntrypoint,
  resolveActiveProductFile,
  type ActiveProductSet,
} from './catalogReader.js'

function readUtf8(filename: string) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename))
  } catch (error) {
    throw new Error('DATA_PRODUCT_FILE_INVALID', { cause: error })
  }
}

function parseJson(filename: string): unknown {
  try {
    return JSON.parse(readUtf8(filename))
  } catch (error) {
    throw new Error('DATA_PRODUCT_FILE_INVALID', { cause: error })
  }
}

function productFile(operation: () => string) {
  try {
    return operation()
  } catch (error) {
    throw new Error('DATA_PRODUCT_FILE_INVALID', { cause: error })
  }
}

export function readCatalogLibrary(active: ActiveProductSet) {
  const value = parseJson(productFile(() => resolveActiveEntrypoint(active, 'library', 'manifest')))
  try {
    return libraryManifestSchema.parse(value)
  } catch (error) {
    throw new Error('DATA_PRODUCT_FILE_INVALID', { cause: error })
  }
}

export function readCatalogInsights(active: ActiveProductSet) {
  const product = active.products?.insights
  if (active.state !== 'ready' || !product) throw new Error('DATA_PRODUCT_UNAVAILABLE')
  const conversations: Array<Record<string, unknown>> = []
  const boards: Record<string, string> = {}
  for (const file of product.manifest.files) {
    if (file.relativePath.startsWith('conv/') && file.relativePath.endsWith('.json')) {
      const value = parseJson(productFile(() => (
        resolveActiveProductFile(active, 'insights', file.relativePath)
      )))
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('DATA_PRODUCT_FILE_INVALID')
      }
      conversations.push(value as Record<string, unknown>)
    } else if (file.relativePath.startsWith('boards/') && file.relativePath.endsWith('.md')) {
      const name = file.relativePath.slice('boards/'.length, -'.md'.length)
      if (!name || Object.hasOwn(boards, name)) throw new Error('DATA_PRODUCT_FILE_INVALID')
      boards[name] = readUtf8(productFile(() => (
        resolveActiveProductFile(active, 'insights', file.relativePath)
      )))
    }
  }
  return { conversations,boards }
}
