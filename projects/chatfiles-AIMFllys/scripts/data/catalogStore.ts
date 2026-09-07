import fs from 'node:fs'
import path from 'node:path'
import { productCatalogSchema, type ProductCatalog } from '../../shared/contracts/productCatalog.js'
import { catalogJournalSchema, type CatalogJournal } from './catalogJournal.js'
import { ensureDataRoleDirectory, strictRealDirectory } from './productFiles.js'

export type CatalogRole = 'current' | 'previous'

function decodeJson(filename: string): unknown {
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('CATALOG_FILE_UNSAFE')
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename))
    return JSON.parse(text)
  } catch (error) {
    throw new Error('CATALOG_JSON_INVALID', { cause: error })
  }
}

export function catalogPath(dataRoot: string, role: CatalogRole) {
  return path.join(dataRoot, `catalog.${role}.json`)
}

export function readCatalogRole(dataRootInput: string, role: CatalogRole) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  const filename = catalogPath(dataRoot, role)
  if (!fs.existsSync(filename)) return { state: 'missing' as const,catalog: null }
  try {
    return { state: 'ready' as const,catalog: productCatalogSchema.parse(decodeJson(filename)) }
  } catch {
    return { state: 'invalid' as const,catalog: null }
  }
}

export function writeTextAtomic(filename: string, text: string, transactionId: string) {
  const temporary = `${filename}.${transactionId}.tmp`
  if (fs.existsSync(temporary)) throw new Error('CATALOG_TEMPORARY_EXISTS')
  fs.writeFileSync(temporary, text, { encoding: 'utf8',flag: 'wx' })
  const handle = fs.openSync(temporary, 'r+')
  try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
  try {
    fs.renameSync(temporary, filename)
  } catch (error) {
    try { fs.unlinkSync(temporary) } catch { /* Preserve the original publication failure. */ }
    throw new Error('CATALOG_ATOMIC_WRITE_FAILED', { cause: error })
  }
}

export function writeCatalogRole(
  dataRoot: string,
  role: CatalogRole,
  catalog: ProductCatalog,
  transactionId: string,
) {
  const parsed = productCatalogSchema.parse(catalog)
  writeTextAtomic(catalogPath(dataRoot, role), `${JSON.stringify(parsed, null, 2)}\n`, transactionId)
}

export function journalPath(dataRoot: string, transactionId: string) {
  const role = path.join(dataRoot, 'catalog-transactions')
  const directory = fs.existsSync(role)
    ? ensureDataRoleDirectory(dataRoot, ['catalog-transactions'], {
      create: false,code: 'CATALOG_JOURNAL_ROLE_INVALID',
    })
    : role
  return path.join(directory, `${transactionId}.json`)
}

export function writeJournal(dataRoot: string, journal: CatalogJournal) {
  const parsed = catalogJournalSchema.parse(journal)
  const directory = ensureDataRoleDirectory(dataRoot, ['catalog-transactions'], {
    create: true,code: 'CATALOG_JOURNAL_ROLE_INVALID',
  })
  writeTextAtomic(
    path.join(directory, `${parsed.transactionId}.json`),
    `${JSON.stringify(parsed, null, 2)}\n`,
    parsed.transactionId,
  )
}

export function readJournal(dataRoot: string, transactionId: string) {
  try {
    return catalogJournalSchema.parse(decodeJson(journalPath(dataRoot, transactionId)))
  } catch (error) {
    throw new Error('CATALOG_JOURNAL_INVALID', { cause: error })
  }
}

export function createCatalogLock(dataRoot: string, transactionId: string) {
  const filename = path.join(dataRoot, '.catalog.lock')
  fs.writeFileSync(filename, `${transactionId}\n`, { encoding: 'utf8',flag: 'wx' })
  return filename
}

export function readCatalogLock(dataRoot: string) {
  const filename = path.join(dataRoot, '.catalog.lock')
  if (!fs.existsSync(filename)) return null
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('CATALOG_LOCK_INVALID')
  const value = fs.readFileSync(filename, 'utf8').trim()
  if (!/^[0-9A-Za-z._-]{1,100}$/u.test(value)) throw new Error('CATALOG_LOCK_INVALID')
  return value
}
