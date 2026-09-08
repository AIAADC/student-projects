import fs from 'node:fs'
import path from 'node:path'
import { productKinds } from '../../shared/contracts/productCatalogCanonical.js'
import { readCatalogLock, readCatalogRole, readJournal } from './catalogStore.js'
import { validateProductCatalog } from './catalogValidation.js'
import { inventoryProductTree, strictRealDirectory } from './productFiles.js'

function refs(value: ReturnType<typeof readCatalogRole>['catalog']) {
  return value ? Object.values(value.products).map((reference) => reference.bundleSha256.slice(7)) : []
}

function safeDirectory(candidate: string, code: string) {
  const stat = fs.lstatSync(candidate)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(code)
  return fs.realpathSync(candidate)
}

export function planGeneratedPrune(dataRootInput: string) {
  const dataRoot = strictRealDirectory(dataRootInput, 'PRUNE_DATA_ROOT_INVALID')
  const current = readCatalogRole(dataRoot, 'current')
  const previous = readCatalogRole(dataRoot, 'previous')
  if (current.state === 'invalid' || previous.state === 'invalid') {
    throw new Error('PRUNE_CATALOG_INVALID')
  }
  if (current.catalog) validateProductCatalog(dataRoot, current.catalog)
  if (previous.catalog) validateProductCatalog(dataRoot, previous.catalog)
  const retained = new Set([...refs(current.catalog),...refs(previous.catalog)])
  const pendingTransactions = new Set<string>()
  const journalsDir = path.join(dataRoot, 'catalog-transactions')
  if (fs.existsSync(journalsDir)) {
    safeDirectory(journalsDir, 'PRUNE_JOURNAL_INVALID')
    for (const entry of fs.readdirSync(journalsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !/^[0-9A-Za-z._-]{1,100}\.json$/u.test(entry.name)) {
        throw new Error('PRUNE_JOURNAL_INVALID')
      }
      const transactionId = entry.name.slice(0, -'.json'.length)
      const journal = readJournal(dataRoot, transactionId)
      if (journal.status === 'validated' || journal.status === 'current_moved'
        || journal.status === 'rollback_failed') {
        pendingTransactions.add(transactionId)
        for (const digest of [...refs(journal.beforeCatalog),...refs(journal.afterCatalog)]) retained.add(digest)
      }
    }
  }
  const lock = readCatalogLock(dataRoot)
  const recoveryIsCoherent = lock === null
    ? pendingTransactions.size === 0
    : pendingTransactions.size === 1 && pendingTransactions.has(lock)
  if (!recoveryIsCoherent) throw new Error('PRUNE_RECOVERY_REQUIRED')
  const candidates: string[] = []
  let bytes = 0
  const productsRoot = path.join(dataRoot, 'products')
  if (fs.existsSync(productsRoot)) {
    safeDirectory(productsRoot, 'PRUNE_PRODUCTS_INVALID')
    for (const kind of productKinds) {
      const kindRoot = path.join(productsRoot, kind)
      if (!fs.existsSync(kindRoot)) continue
      safeDirectory(kindRoot, 'PRUNE_PRODUCTS_INVALID')
      for (const entry of fs.readdirSync(kindRoot, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.isSymbolicLink() || !/^[0-9a-f]{64}$/u.test(entry.name)) {
          throw new Error('PRUNE_PRODUCTS_INVALID')
        }
        if (retained.has(entry.name)) continue
        const files = inventoryProductTree(path.join(kindRoot, entry.name))
        bytes += files.reduce((sum, file) => sum + file.size, 0)
        candidates.push(`products/${kind}/${entry.name}`)
      }
    }
  }
  const stagingRoot = path.join(dataRoot, 'product-staging')
  if (fs.existsSync(stagingRoot)) {
    safeDirectory(stagingRoot, 'PRUNE_STAGING_INVALID')
    for (const entry of fs.readdirSync(stagingRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()
        || !/^[0-9A-Za-z._-]{1,100}$/u.test(entry.name)) throw new Error('PRUNE_STAGING_INVALID')
      if (pendingTransactions.has(entry.name)) continue
      const files = inventoryProductTree(path.join(stagingRoot, entry.name))
      bytes += files.reduce((sum, file) => sum + file.size, 0)
      candidates.push(`product-staging/${entry.name}`)
    }
  }
  return { dryRun: true,candidates: candidates.sort(),counts: { entries: candidates.length,bytes } }
}
