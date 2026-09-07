import fs from 'node:fs'
import path from 'node:path'
import type { DataProductStatus } from '../../shared/contracts/dataStatus.js'
import { legacyMigrationReceiptSchema } from '../../shared/contracts/dataMigration.js'
import type { ProductCatalog, ProductKind, ProductManifest } from '../../shared/contracts/productCatalog.js'
import { productKinds } from '../../shared/contracts/productCatalogCanonical.js'
import { validateCatalogProductDomain } from './catalogDomainValidation.js'
import { readCatalogLock, readCatalogRole, readJournal } from './catalogStore.js'
import { bundleSetSha256, catalogSha256 } from './catalogValidation.js'
import {
  digestFile,
  digestText,
  ensureDataRoleDirectory,
  inventoryProductTree,
  strictRealDirectory,
} from './productFiles.js'
import { readSealedProductManifest, validateSealedProduct } from './productSealer.js'
import { inspectDerivedSearch } from './searchIndexHealth.js'

function productStatus(
  state: DataProductStatus['state'],
  input?: ProductManifest,
): DataProductStatus {
  return input ? {
    schemaVersion: input.domainSchemaVersion,runId: input.runId,fingerprint: input.bundleSha256,
    state,counts: input.counts,issues: state === 'ready' ? [] : [state],
  } : { schemaVersion: null,runId: null,fingerprint: null,state,counts: {},issues: [state] }
}

function productStatuses(state: DataProductStatus['state']) {
  return Object.fromEntries(productKinds.map((kind) => [kind, productStatus(state)])) as Record<
    ProductKind,DataProductStatus
  >
}

function transactionMetrics(dataRoot: string) {
  const directory = path.join(dataRoot, 'catalog-transactions')
  const pendingIds = new Set<string>()
  if (!fs.existsSync(directory)) return { pending: 0,terminal: 0,invalid: 0,pendingIds }
  const stat = fs.lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return { pending: 0,terminal: 0,invalid: 1,pendingIds }
  }
  let pending = 0
  let terminal = 0
  let invalid = 0
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.isSymbolicLink() || !/^[0-9A-Za-z._-]{1,100}\.json$/u.test(entry.name)) {
      invalid++
      continue
    }
    try {
      const journal = readJournal(dataRoot, entry.name.slice(0, -'.json'.length))
      if (journal.status === 'validated' || journal.status === 'current_moved'
        || journal.status === 'rollback_failed') {
        pending++
        pendingIds.add(journal.transactionId)
      }
      else terminal++
    } catch { invalid++ }
  }
  return { pending,terminal,invalid,pendingIds }
}

function dependenciesValid(
  kind: ProductKind,
  manifest: ProductManifest,
  manifests: Partial<Record<ProductKind, ProductManifest>>,
) {
  if ((kind === 'assets' || kind === 'insights') && !manifest.dependencies.wechat) return false
  for (const dependencyKind of productKinds) {
    const dependency = manifest.dependencies[dependencyKind]
    if (!dependency) continue
    const target = manifests[dependencyKind]
    const file = target?.files.find((candidate) => candidate.relativePath === dependency.entrypoint)
    if (!target || !file || target.bundleSha256 !== dependency.bundleSha256
      || file.sha256 !== dependency.entrypointSha256 || target.runId !== dependency.runId
      || target.domainSchemaVersion !== dependency.domainSchemaVersion
      || target.domainReceiptSha256 !== dependency.domainReceiptSha256) return false
  }
  return true
}

function inspectCatalog(dataRoot: string, catalog: ProductCatalog) {
  if (bundleSetSha256(catalog.products) !== catalog.bundleSetSha256) {
    throw new Error('CATALOG_BUNDLE_SET_MISMATCH')
  }
  const manifests: Partial<Record<ProductKind, ProductManifest>> = {}
  const statuses = {} as Record<ProductKind, DataProductStatus>
  for (const kind of productKinds) {
    try {
      manifests[kind] = readSealedProductManifest({ dataRoot,kind,reference: catalog.products[kind] })
    } catch { statuses[kind] = productStatus('invalid') }
  }
  for (const kind of productKinds) {
    const manifest = manifests[kind]
    if (!manifest) continue
    if (!dependenciesValid(kind, manifest, manifests)) {
      statuses[kind] = productStatus('dependency_mismatch', manifest)
      continue
    }
    try {
      validateSealedProduct({ dataRoot,kind,reference: catalog.products[kind] })
      validateCatalogProductDomain(dataRoot, kind, manifest, manifests)
      statuses[kind] = productStatus('ready', manifest)
    } catch { statuses[kind] = productStatus('invalid', manifest) }
  }
  return statuses
}

function deepCatalogState(dataRoot: string, role: ReturnType<typeof readCatalogRole>) {
  if (role.state !== 'ready' || !role.catalog) return role.state
  try {
    const statuses = inspectCatalog(dataRoot, role.catalog)
    return productKinds.every((kind) => statuses[kind].state === 'ready') ? 'ready' : 'invalid'
  } catch { return 'invalid' }
}

function migrationReceiptMatches(dataRoot: string, catalog: ProductCatalog) {
  try {
    const receiptRoot = ensureDataRoleDirectory(dataRoot, ['migration-receipts'], {
      create: false,code: 'MIGRATION_RECEIPT_ROLE_INVALID',
    })
    const filename = path.join(receiptRoot, `${catalog.transactionId}.json`)
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) return false
    const receipt = legacyMigrationReceiptSchema.parse(JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)),
    ))
    if (receipt.transactionId !== catalog.transactionId
      || receipt.catalogSha256 !== catalogSha256(catalog)) return false
    return receipt.sources.every((source) => {
      const target = path.join(dataRoot, source.role)
      if (source.role === 'library.json') {
        const sourceStat = fs.lstatSync(target)
        return sourceStat.isFile() && !sourceStat.isSymbolicLink()
          && source.files === 1 && source.bytes === sourceStat.size
          && source.fingerprint === digestFile(target)
      }
      const files = inventoryProductTree(strictRealDirectory(target, 'MIGRATION_SOURCE_INVALID'))
      return source.files === files.length
        && source.bytes === files.reduce((sum, file) => sum + file.size, 0)
        && source.fingerprint === digestText(JSON.stringify(files))
    })
  } catch { return false }
}

export function inspectDataProducts(dataRootInput: string) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  const issues: string[] = []
  const current = readCatalogRole(dataRoot, 'current')
  const previous = readCatalogRole(dataRoot, 'previous')
  let lock: string | null = null
  let lockInvalid = false
  try { lock = readCatalogLock(dataRoot) } catch { lockInvalid = true }
  const metrics = transactionMetrics(dataRoot)
  const transactions = { pending: metrics.pending,terminal: metrics.terminal,invalid: metrics.invalid }
  if (metrics.invalid > 0) issues.push('transaction_journal_invalid')
  const recoveryCoherent = lock !== null && metrics.pendingIds.size === 1 && metrics.pendingIds.has(lock)
  const recoveryRequired = lockInvalid || metrics.pending > 0 || lock !== null
  if (metrics.pending > 0 && !lock) issues.push('transaction_journal_pending_without_lock')
  if (recoveryRequired && !recoveryCoherent) issues.push('catalog_recovery_incoherent')
  const previousState = deepCatalogState(dataRoot, previous)
  if (previousState === 'invalid') issues.push('previous_catalog_invalid')

  let state: 'ready' | 'degraded' | 'missing' | 'invalid' | 'recovery_required'
  let products: Record<ProductKind, DataProductStatus>
  if (recoveryRequired) {
    state = 'recovery_required'
    products = productStatuses('invalid')
  } else if (current.state === 'missing') {
    state = 'missing'
    products = productStatuses('missing')
  } else if (current.state === 'invalid' || !current.catalog) {
    state = 'invalid'
    products = productStatuses('invalid')
  }
  else {
    try {
      products = inspectCatalog(dataRoot, current.catalog)
      state = productKinds.every((kind) => products[kind].state === 'ready') ? 'ready' : 'degraded'
    } catch {
      state = 'invalid'
      issues.push('current_catalog_invalid')
      products = productStatuses('invalid')
    }
  }
  const legacyRoles = [
    'wechat.db','library.json','insights','wechat.current','chat-assets.current','library.current',
  ]
  if (legacyRoles.some((role) => fs.existsSync(path.join(dataRoot, role)))) {
    const preserved = Boolean(current.catalog && migrationReceiptMatches(dataRoot, current.catalog))
    issues.push(preserved ? 'legacy_layout_preserved' : 'legacy_layout_split_brain')
    if (!preserved && state === 'ready') state = 'degraded'
  }
  if ((metrics.invalid > 0 || previousState === 'invalid') && state === 'ready') state = 'degraded'
  return {
    state,
    catalog: { current: current.state,previous: previousState,locked: Boolean(lock) || lockInvalid },
    products,
    transactions,
    derived: { search: inspectDerivedSearch(dataRoot, products.wechat.fingerprint) },
    issues: [...new Set(issues)].sort(),
  }
}
