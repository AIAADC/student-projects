import fs from 'node:fs'
import path from 'node:path'
import { legacyMigrationReceiptSchema } from '../../shared/contracts/dataMigration.js'
import { libraryManifestSchema } from '../../shared/contracts/files.js'
import {
  catalogTransactionIdSchema,
  productCatalogSchema,
  type ProductKind,
} from '../../shared/contracts/productCatalog.js'
import { productKinds } from '../../shared/contracts/productCatalogCanonical.js'
import { writeTextAtomic } from './catalogStore.js'
import { activateCatalog, readActiveCatalog } from './catalogTransaction.js'
import {
  copyProductFiles,
  digestFile,
  digestText,
  ensureDataRoleDirectory,
  inventoryProductTree,
  strictRealDirectory,
} from './productFiles.js'
import { sealStagedProductRelease } from './productLifecycle.js'

type MigrationSealInput = {
  projectRoot: string
  dataRoot: string
  transactionId: string
  kind: ProductKind
  accountRoot?: string
}

export type LegacyMigrationOperations = {
  seal: (input: MigrationSealInput) => unknown
  activate: (input: { dataRoot: string;transactionId: string }) => { sha256: string }
}

const legacyRoles: Record<ProductKind, string> = {
  wechat: 'wechat.current',assets: 'chat-assets.current',
  library: 'library.current',insights: 'insights',
}

function stageDirectory(input: {
  dataRoot: string;transactionId: string;kind: ProductKind;source: string;role: string
}) {
  const source = strictRealDirectory(input.source, 'MIGRATION_SOURCE_INVALID')
  const transactionRoot = ensureDataRoleDirectory(
    input.dataRoot,['product-staging', input.transactionId],
    { create: true,code: 'PRODUCT_STAGING_ROLE_INVALID' },
  )
  const destination = path.join(transactionRoot, input.kind)
  if (fs.existsSync(destination)) throw new Error('PRODUCT_STAGING_EXISTS')
  fs.mkdirSync(destination)
  const files = inventoryProductTree(source)
  try { copyProductFiles(source, destination, files) }
  catch (error) { fs.rmSync(destination, { recursive: true,force: true }); throw error }
  return {
    kind: input.kind,role: input.role,fingerprint: digestText(JSON.stringify(files)),
    files: files.length,bytes: files.reduce((sum, file) => sum + file.size, 0),
  }
}

function stageLegacyLibraryFile(dataRoot: string, transactionId: string) {
  const filename = path.join(dataRoot, 'library.json')
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('MIGRATION_LIBRARY_INVALID')
  let manifest: ReturnType<typeof libraryManifestSchema.parse>
  try {
    manifest = libraryManifestSchema.parse(JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)),
    ))
  } catch (error) { throw new Error('MIGRATION_LIBRARY_INVALID', { cause: error }) }
  const transactionRoot = ensureDataRoleDirectory(dataRoot, ['product-staging', transactionId], {
    create: true,code: 'PRODUCT_STAGING_ROLE_INVALID',
  })
  const destination = path.join(transactionRoot, 'library')
  if (fs.existsSync(destination)) throw new Error('PRODUCT_STAGING_EXISTS')
  fs.mkdirSync(destination)
  const manifestPath = path.join(destination, 'manifest.json')
  fs.copyFileSync(filename, manifestPath, fs.constants.COPYFILE_EXCL)
  fs.writeFileSync(path.join(destination, 'receipt.json'), `${JSON.stringify({
    formatVersion: 1,bundle: 'library.next',runId: `migration-${transactionId}`,
    manifestFile: 'manifest.json',manifestSha256: digestFile(manifestPath).slice(7),
    generatedAt: manifest.generatedAt,plannedCopies: 0,completedCopies: 0,
  }, null, 2)}\n`, { encoding: 'utf8',flag: 'wx' })
  return {
    kind: 'library' as const,role: 'library.json',fingerprint: digestFile(filename),
    files: 1,bytes: stat.size,
  }
}

function defaultOperations(): LegacyMigrationOperations {
  return {
    seal: sealStagedProductRelease,
    activate: ({ dataRoot,transactionId }) => {
      const filename = path.join(dataRoot, 'catalog.next.json')
      const stat = fs.lstatSync(filename)
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('DATA_CATALOG_CANDIDATE_UNSAFE')
      let catalog
      try {
        catalog = productCatalogSchema.parse(JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)),
        ))
      } catch (error) { throw new Error('DATA_CATALOG_CANDIDATE_INVALID', { cause: error }) }
      if (catalog.transactionId !== transactionId) throw new Error('DATA_CATALOG_TRANSACTION_MISMATCH')
      return activateCatalog({ dataRoot,catalog })
    },
  }
}

export function migrateLegacyLayout(input: {
  projectRoot: string
  transactionId: string
  accountRoot: string
  operations?: LegacyMigrationOperations
}) {
  const projectRoot = strictRealDirectory(input.projectRoot, 'PROJECT_ROOT_INVALID')
  const dataRoot = strictRealDirectory(path.join(projectRoot, 'data'), 'CATALOG_DATA_ROOT_UNSAFE')
  const transactionId = catalogTransactionIdSchema.parse(input.transactionId)
  const accountRoot = strictRealDirectory(input.accountRoot, 'MIGRATION_ACCOUNT_ROOT_INVALID')
  if (readActiveCatalog(dataRoot).state !== 'missing') throw new Error('MIGRATION_CATALOG_ALREADY_PRESENT')
  const sources = productKinds.map((kind) => {
    const role = legacyRoles[kind]
    const source = path.join(dataRoot, role)
    if (kind === 'library' && !fs.existsSync(source)) {
      return stageLegacyLibraryFile(dataRoot, transactionId)
    }
    return stageDirectory({ dataRoot,transactionId,kind,source,role })
  })
  const operations = input.operations ?? defaultOperations()
  for (const kind of productKinds) operations.seal({
    projectRoot,dataRoot,transactionId,kind,...(kind === 'assets' ? { accountRoot } : {}),
  })
  const activation = operations.activate({ dataRoot,transactionId })
  const receiptRoot = ensureDataRoleDirectory(dataRoot, ['migration-receipts'], {
    create: true,code: 'MIGRATION_RECEIPT_ROLE_INVALID',
  })
  const receipt = legacyMigrationReceiptSchema.parse({
    version: 1,transactionId,status: 'activated',completedAt: new Date().toISOString(),
    catalogSha256: activation.sha256,sources,
  })
  writeTextAtomic(
    path.join(receiptRoot, `${transactionId}.json`),`${JSON.stringify(receipt, null, 2)}\n`,transactionId,
  )
  return receipt
}
