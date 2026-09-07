import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod/v4'
import {
  catalogTransactionIdSchema,
  productKindSchema,
  productReferenceSchema,
  type ProductKind,
  type ProductManifest,
  type ProductReference,
} from '../../shared/contracts/productCatalog.js'
import { productKinds } from '../../shared/contracts/productCatalogCanonical.js'
import {
  validateAssetProductBundle,
  validateInsightProductBundle,
  validateLibraryProductBundle,
  validateWechatProductBundle,
  type ProductReleaseMetadata,
} from './productAdapters.js'
import { writeTextAtomic } from './catalogStore.js'
import { createProductCatalog, readActiveCatalog } from './catalogTransaction.js'
import { ensureDataRoleDirectory, strictRealDirectory } from './productFiles.js'
import { sealProduct, validateSealedProduct } from './productSealer.js'

const referencesSchema = z.object({
  wechat: productReferenceSchema.optional(),assets: productReferenceSchema.optional(),
  library: productReferenceSchema.optional(),insights: productReferenceSchema.optional(),
}).strict()

type LifecycleContext = { wechatManifest?: ProductManifest }

export type SealStagedProductReleaseInput = {
  projectRoot: string
  dataRoot: string
  transactionId: string
  kind: ProductKind
  accountRoot?: string
  wechatManifest?: ProductManifest
  metadata?: (context: LifecycleContext) => ProductReleaseMetadata
}

function readReferences(filename: string) {
  if (!fs.existsSync(filename)) return {} as Partial<Record<ProductKind, ProductReference>>
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PRODUCT_REFERENCES_INVALID')
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)))
    return referencesSchema.parse(value)
  } catch (error) {
    throw new Error('PRODUCT_REFERENCES_INVALID', { cause: error })
  }
}

function defaultMetadata(input: {
  projectRoot: string
  dataRoot: string
  stagingDir: string
  kind: ProductKind
  accountRoot?: string
  wechatManifest?: ProductManifest
}) {
  if (input.kind === 'wechat') return validateWechatProductBundle(input.stagingDir)
  if (input.kind === 'library') {
    return validateLibraryProductBundle(input.stagingDir, input.projectRoot)
  }
  if (!input.wechatManifest) throw new Error('DATA_SEAL_WECHAT_DEPENDENCY_MISSING')
  if (input.kind === 'assets') {
    if (!input.accountRoot) throw new Error('DATA_SEAL_ACCOUNT_ROOT_REQUIRED')
    return validateAssetProductBundle({
      bundleDir: input.stagingDir,accountRoot: input.accountRoot,
      wechatManifest: input.wechatManifest,
    })
  }
  const database = input.wechatManifest.entrypoints.database
  if (!database) throw new Error('DATA_SEAL_WECHAT_DEPENDENCY_INVALID')
  const databasePath = path.join(
    input.dataRoot,'products','wechat',input.wechatManifest.bundleSha256.slice(7),...database.split('/'),
  )
  return validateInsightProductBundle({
    root: input.projectRoot,bundleDir: input.stagingDir,wechatDatabasePath: databasePath,
    wechatManifest: input.wechatManifest,
  })
}

export function sealStagedProductRelease(input: SealStagedProductReleaseInput) {
  const projectRoot = strictRealDirectory(input.projectRoot, 'PROJECT_ROOT_INVALID')
  const dataRoot = strictRealDirectory(input.dataRoot, 'PRODUCT_DATA_ROOT_UNSAFE')
  const transactionId = catalogTransactionIdSchema.parse(input.transactionId)
  const kind = productKindSchema.parse(input.kind)
  const transactionRoot = ensureDataRoleDirectory(dataRoot, ['product-staging', transactionId], {
    create: false,code: 'PRODUCT_STAGING_ROLE_INVALID',
  })
  const stagingDir = ensureDataRoleDirectory(dataRoot, ['product-staging', transactionId, kind], {
    create: false,code: 'PRODUCT_STAGING_ROLE_INVALID',
  })
  const referencesPath = path.join(transactionRoot, 'references.json')
  const references = readReferences(referencesPath)
  let wechatManifest = input.wechatManifest
  if (!wechatManifest && references.wechat) {
    wechatManifest = validateSealedProduct({ dataRoot,kind: 'wechat',reference: references.wechat })
  }
  const metadata = input.metadata?.({ wechatManifest }) ?? defaultMetadata({
    projectRoot,dataRoot,stagingDir,kind,accountRoot: input.accountRoot,wechatManifest,
  })
  const sealed = sealProduct({ dataRoot,stagingDir,kind,...metadata })
  references[kind] = sealed.reference
  const parsedReferences = referencesSchema.parse(references)
  writeTextAtomic(referencesPath, `${JSON.stringify(parsedReferences, null, 2)}\n`, transactionId)
  let candidate = false
  if (productKinds.every((productKind) => parsedReferences[productKind])) {
    const active = readActiveCatalog(dataRoot)
    if (active.state === 'invalid' || active.state === 'recovery_required') {
      throw new Error('CATALOG_CURRENT_INVALID')
    }
    const catalog = createProductCatalog({
      transactionId,committedAt: new Date().toISOString(),
      ...(active.state === 'ready' && active.sha256
        ? { parentCatalogSha256: active.sha256 } : {}),
      products: parsedReferences as Record<ProductKind, ProductReference>,
    })
    writeTextAtomic(
      path.join(dataRoot, 'catalog.next.json'),`${JSON.stringify(catalog, null, 2)}\n`,transactionId,
    )
    candidate = true
  }
  return { status: 'sealed' as const,kind,reference: sealed.reference,candidate }
}
