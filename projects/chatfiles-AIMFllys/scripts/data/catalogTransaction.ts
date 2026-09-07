import fs from 'node:fs'
import path from 'node:path'
import {
  productCatalogSchema,
  type ProductCatalog,
  type ProductKind,
  type ProductReference,
} from '../../shared/contracts/productCatalog.js'
import { catalogJournalSchema, initialJournal, journalWithStatus } from './catalogJournal.js'
import {
  createCatalogLock,
  catalogPath,
  journalPath,
  readCatalogLock,
  readCatalogRole,
  readJournal,
  writeCatalogRole,
  writeJournal,
} from './catalogStore.js'
import {
  bundleSetSha256,
  validateProductCatalog,
} from './catalogValidation.js'
import { strictRealDirectory } from './productFiles.js'

export type CatalogFaultPoint =
  | 'after_validated'
  | 'after_previous'
  | 'after_current'
  | 'before_activated'

function now() {
  return new Date().toISOString()
}

function removeLock(filename: string) {
  try {
    fs.unlinkSync(filename)
  } catch (error) {
    throw new Error('CATALOG_LOCK_RELEASE_FAILED', { cause: error })
  }
}

function readValidatedRole(dataRoot: string, role: 'current' | 'previous') {
  const resolution = readCatalogRole(dataRoot, role)
  if (resolution.state !== 'ready' || !resolution.catalog) return resolution
  try {
    const validated = validateProductCatalog(dataRoot, resolution.catalog)
    return { state: 'ready' as const,...validated }
  } catch {
    return { state: 'invalid' as const,catalog: null }
  }
}

export function createProductCatalog(input: {
  transactionId: string
  committedAt: string
  parentCatalogSha256?: string
  products: Record<ProductKind, ProductReference>
}) {
  return productCatalogSchema.parse({
    schemaVersion: 1,
    transactionId: input.transactionId,
    committedAt: input.committedAt,
    ...(input.parentCatalogSha256 ? { parentCatalogSha256: input.parentCatalogSha256 } : {}),
    products: input.products,
    bundleSetSha256: bundleSetSha256(input.products),
  })
}

export function readActiveCatalog(dataRootInput: string) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  const current = readValidatedRole(dataRoot, 'current')
  const previous = readValidatedRole(dataRoot, 'previous')
  const lock = readCatalogLock(dataRoot)
  return {
    state: lock ? 'recovery_required' as const : current.state,
    catalog: current.state === 'ready' ? current.catalog : null,
    sha256: current.state === 'ready' ? current.sha256 : null,
    previous: previous.state,
    transactionId: lock,
  }
}

export function activateCatalog(input: {
  dataRoot: string
  catalog: ProductCatalog
  expectedCurrentSha256?: string
  fault?: (point: CatalogFaultPoint) => void
  io?: { writeCatalogRole?: typeof writeCatalogRole }
}) {
  const dataRoot = strictRealDirectory(input.dataRoot, 'CATALOG_DATA_ROOT_UNSAFE')
  if (readCatalogLock(dataRoot)) throw new Error('CATALOG_RECOVERY_REQUIRED')
  const candidate = validateProductCatalog(dataRoot, input.catalog)
  const current = readValidatedRole(dataRoot, 'current')
  if (current.state === 'invalid') throw new Error('CATALOG_CURRENT_INVALID')
  const previous = readValidatedRole(dataRoot, 'previous')
  if (current.state === 'missing' && previous.state !== 'missing') {
    throw new Error('CATALOG_INITIAL_STATE_INVALID')
  }
  const before = current.state === 'ready' ? current : null
  if (input.expectedCurrentSha256 !== undefined
    && before?.sha256 !== input.expectedCurrentSha256) throw new Error('CATALOG_COMPARE_AND_SWAP_FAILED')
  if (before && candidate.catalog.parentCatalogSha256 !== before.sha256) {
    throw new Error('CATALOG_PARENT_MISMATCH')
  }
  if (!before && candidate.catalog.parentCatalogSha256 !== undefined) {
    throw new Error('CATALOG_PARENT_MISMATCH')
  }
  if (fs.existsSync(journalPath(dataRoot, candidate.catalog.transactionId))) {
    throw new Error('CATALOG_TRANSACTION_EXISTS')
  }
  let lockPath: string
  try {
    lockPath = createCatalogLock(dataRoot, candidate.catalog.transactionId)
  } catch (error) {
    throw new Error('CATALOG_LOCKED', { cause: error })
  }
  let journalStarted = false
  let simulatedCrash = false
  let journal: ReturnType<typeof initialJournal> | undefined
  const writeRole = input.io?.writeCatalogRole ?? writeCatalogRole
  const injectFault = (point: CatalogFaultPoint) => {
    try { input.fault?.(point) }
    catch (error) { simulatedCrash = true; throw error }
  }
  try {
    journal = initialJournal({
      transactionId: candidate.catalog.transactionId,
      beforeCatalog: before?.catalog ?? null,
      beforeSha256: before?.sha256 ?? null,
      afterCatalog: candidate.catalog,
      afterSha256: candidate.sha256,
      updatedAt: now(),
    })
    writeJournal(dataRoot, journal)
    journalStarted = true
    injectFault('after_validated')
    if (before) writeRole(dataRoot, 'previous', before.catalog, journal.transactionId)
    writeJournal(dataRoot, journalWithStatus(journal, 'current_moved', now()))
    injectFault('after_previous')
    writeRole(dataRoot, 'current', candidate.catalog, journal.transactionId)
    injectFault('after_current')
    const published = validateProductCatalog(
      dataRoot,
      readCatalogRole(dataRoot, 'current').catalog,
    )
    if (published.sha256 !== candidate.sha256) throw new Error('CATALOG_PUBLICATION_MISMATCH')
    injectFault('before_activated')
    writeJournal(dataRoot, journalWithStatus(journal, 'activated', now()))
    removeLock(lockPath)
    return { status: 'activated' as const,sha256: candidate.sha256 }
  } catch (error) {
    if (!journalStarted) removeLock(lockPath)
    else if (!simulatedCrash && journal) {
      try {
        const observed = readValidatedRole(dataRoot, 'current')
        if (before) {
          if (observed.state !== 'ready' || observed.sha256 !== before.sha256) {
            writeRole(dataRoot, 'current', before.catalog, journal.transactionId)
          }
          const restored = readValidatedRole(dataRoot, 'current')
          if (restored.state !== 'ready' || restored.sha256 !== before.sha256) {
            throw new Error('CATALOG_ROLLBACK_VERIFICATION_FAILED', { cause: error })
          }
        } else {
          const currentPath = catalogPath(dataRoot, 'current')
          if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath)
          if (readValidatedRole(dataRoot, 'current').state !== 'missing') {
            throw new Error('CATALOG_ROLLBACK_VERIFICATION_FAILED', { cause: error })
          }
        }
        writeJournal(dataRoot, journalWithStatus(journal, 'rolled_back', now()))
        removeLock(lockPath)
      } catch (rollbackError) {
        try { writeJournal(dataRoot, journalWithStatus(journal, 'rollback_failed', now())) }
        catch { /* The lock still forces explicit recovery when journal publication also fails. */ }
        throw new AggregateError(
          [error, rollbackError],
          'CATALOG_ACTIVATION_ROLLBACK_FAILED',
          { cause: rollbackError },
        )
      }
    }
    throw error
  }
}

export function recoverCatalog(dataRootInput: string) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  const transactionId = readCatalogLock(dataRoot)
  if (!transactionId) return { status: 'clean' as const }
  const finalJournalPath = journalPath(dataRoot, transactionId)
  if (!fs.existsSync(finalJournalPath)) {
    const temporary = `${finalJournalPath}.${transactionId}.tmp`
    if (!fs.existsSync(temporary)) {
      const current = readValidatedRole(dataRoot, 'current')
      if (current.state !== 'ready' && current.state !== 'missing') {
        throw new Error('CATALOG_RECOVERY_REQUIRED')
      }
      removeLock(path.join(dataRoot, '.catalog.lock'))
      return { status: 'rolled_back' as const }
    }
    try {
      const stat = fs.lstatSync(temporary)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error()
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
        fs.readFileSync(temporary),
      ))
      const pending = catalogJournalSchema.parse(value)
      if (pending.transactionId !== transactionId) throw new Error()
      fs.renameSync(temporary, finalJournalPath)
    } catch (error) {
      throw new Error('CATALOG_JOURNAL_INVALID', { cause: error })
    }
  }
  const journal = readJournal(dataRoot, transactionId)
  validateProductCatalog(dataRoot, journal.afterCatalog)
  if (journal.beforeCatalog) validateProductCatalog(dataRoot, journal.beforeCatalog)
  const current = readValidatedRole(dataRoot, 'current')
  const lockPath = path.join(dataRoot, '.catalog.lock')
  if (current.state === 'ready' && current.sha256 === journal.afterSha256) {
    writeJournal(dataRoot, journalWithStatus(journal, 'activated', now()))
    removeLock(lockPath)
    return { status: 'activated' as const }
  }
  const restored = journal.beforeCatalog === null
    ? current.state === 'missing'
    : current.state === 'ready' && current.sha256 === journal.beforeSha256
  if (restored) {
    writeJournal(dataRoot, journalWithStatus(journal, 'rolled_back', now()))
    removeLock(lockPath)
    return { status: 'rolled_back' as const }
  }
  try {
    if (journal.beforeCatalog) {
      writeCatalogRole(dataRoot, 'current', journal.beforeCatalog, journal.transactionId)
    } else {
      const currentPath = catalogPath(dataRoot, 'current')
      if (fs.existsSync(currentPath)) fs.unlinkSync(currentPath)
    }
    const verified = readValidatedRole(dataRoot, 'current')
    const valid = journal.beforeCatalog === null
      ? verified.state === 'missing'
      : verified.state === 'ready' && verified.sha256 === journal.beforeSha256
    if (!valid) throw new Error('CATALOG_ROLLBACK_VERIFICATION_FAILED')
    writeJournal(dataRoot, journalWithStatus(journal, 'rolled_back', now()))
    removeLock(lockPath)
    return { status: 'rolled_back' as const }
  } catch (error) {
    try { writeJournal(dataRoot, journalWithStatus(journal, 'rollback_failed', now())) }
    catch { /* Preserve the pending lock even if the terminal journal cannot be written. */ }
    throw new Error('CATALOG_RECOVERY_REQUIRED', { cause: error })
  }
}

export function rollbackCatalog(input: {
  dataRoot: string
  transactionId: string
  committedAt: string
}) {
  const active = readActiveCatalog(input.dataRoot)
  if (active.state !== 'ready' || !active.catalog || !active.sha256) {
    throw new Error('CATALOG_CURRENT_INVALID')
  }
  const previous = readValidatedRole(input.dataRoot, 'previous')
  if (previous.state !== 'ready') throw new Error('CATALOG_PREVIOUS_INVALID')
  const candidate = createProductCatalog({
    transactionId: input.transactionId,
    committedAt: input.committedAt,
    parentCatalogSha256: active.sha256,
    products: previous.catalog.products,
  })
  return activateCatalog({
    dataRoot: input.dataRoot,catalog: candidate,expectedCurrentSha256: active.sha256,
  })
}
