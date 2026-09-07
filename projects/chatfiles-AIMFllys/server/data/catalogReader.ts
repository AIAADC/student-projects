import fs from 'node:fs'
import path from 'node:path'
import {
  dataCatalogStatusSchema,
  dataProductStatusSchema,
  type DataProductStatus,
} from '../../shared/contracts/dataStatus.js'
import {
  productCatalogSchema,
  productManifestSchema,
  type ProductCatalog,
  type ProductKind,
  type ProductManifest,
} from '../../shared/contracts/productCatalog.js'
import {
  productBundleSetCanonicalText,
  productKinds,
  productManifestCanonicalText,
} from '../../shared/contracts/productCatalogCanonical.js'
import {
  runtimeContained,
  runtimeDigestFile,
  runtimeDigestText,
  runtimeDirectory,
  runtimeJson,
} from './catalogRuntimeFiles.js'
import { validateRuntimeProductDomain } from './productDomainValidation.js'

type RuntimeProduct = { root: string;manifest: ProductManifest }

export type ActiveProductSet = {
  state: 'ready' | 'missing' | 'invalid' | 'recovery_required'
  catalog: ProductCatalog | null
  products: Partial<Record<ProductKind, RuntimeProduct>> | null
  status: {
    catalog: { state: 'ready' | 'missing' | 'invalid' | 'recovery_required';previous: 'ready' | 'missing' | 'invalid';transactionId: string | null }
    products: Record<ProductKind, DataProductStatus>
  }
}

function missingProduct(state: DataProductStatus['state'], issue: string): DataProductStatus {
  return dataProductStatusSchema.parse({
    schemaVersion: null,runId: null,fingerprint: null,state,counts: {},issues: [issue],
  })
}

function allProductStatuses(status: DataProductStatus) {
  return Object.fromEntries(productKinds.map((kind) => [kind, status])) as Record<
    ProductKind,
    DataProductStatus
  >
}

function previousState(dataRoot: string) {
  const filename = path.join(dataRoot, 'catalog.previous.json')
  if (!fs.existsSync(filename)) return 'missing' as const
  try {
    const catalog = productCatalogSchema.parse(runtimeJson(filename, 'CATALOG_PREVIOUS_INVALID'))
    const expected = runtimeDigestText(productBundleSetCanonicalText(catalog.products))
    if (expected !== catalog.bundleSetSha256) return 'invalid' as const
    readValidCatalogProducts(dataRoot, catalog)
    return 'ready' as const
  } catch {
    return 'invalid' as const
  }
}

function readProduct(dataRoot: string, catalog: ProductCatalog, kind: ProductKind) {
  const reference = catalog.products[kind]
  const expectedRoot = path.join(dataRoot, 'products', kind, reference.bundleSha256.slice(7))
  const root = runtimeDirectory(expectedRoot, 'PRODUCT_DIRECTORY_INVALID')
  if (!runtimeContained(dataRoot, root)) throw new Error('PRODUCT_DIRECTORY_INVALID')
  const manifestPath = path.join(root, 'product.json')
  if (runtimeDigestFile(manifestPath) !== reference.manifestSha256) {
    throw new Error('PRODUCT_MANIFEST_DIGEST_MISMATCH')
  }
  const manifest = productManifestSchema.parse(runtimeJson(manifestPath, 'PRODUCT_MANIFEST_INVALID'))
  if (manifest.kind !== kind || manifest.bundleSha256 !== reference.bundleSha256
    || runtimeDigestText(productManifestCanonicalText(manifest)) !== manifest.bundleSha256) {
    throw new Error('PRODUCT_MANIFEST_BINDING_MISMATCH')
  }
  return { root,manifest }
}

function dependenciesValid(
  kind: ProductKind,
  product: RuntimeProduct,
  products: Partial<Record<ProductKind, RuntimeProduct>>,
) {
  if ((kind === 'assets' || kind === 'insights') && !product.manifest.dependencies.wechat) return false
  for (const dependencyKind of productKinds) {
    const dependency = product.manifest.dependencies[dependencyKind]
    if (!dependency) continue
    const target = products[dependencyKind]?.manifest
    const file = target?.files.find((candidate) => candidate.relativePath === dependency.entrypoint)
    if (!target || !file || target.bundleSha256 !== dependency.bundleSha256
      || file.sha256 !== dependency.entrypointSha256
      || target.runId !== dependency.runId
      || target.domainSchemaVersion !== dependency.domainSchemaVersion
      || target.domainReceiptSha256 !== dependency.domainReceiptSha256) return false
  }
  return true
}

function manifestStatus(
  product: RuntimeProduct,
  state: DataProductStatus['state'] = 'ready',
  issue?: string,
): DataProductStatus {
  return dataProductStatusSchema.parse({
    schemaVersion: product.manifest.domainSchemaVersion,
    runId: product.manifest.runId,
    fingerprint: product.manifest.bundleSha256,
    state,
    counts: product.manifest.counts,
    issues: issue ? [issue] : [],
  })
}

function readValidCatalogProducts(dataRoot: string, catalog: ProductCatalog) {
  const products: Partial<Record<ProductKind, RuntimeProduct>> = {}
  for (const kind of productKinds) {
    const product = readProduct(dataRoot, catalog, kind)
    validateRuntimeProductDomain(kind, product)
    products[kind] = product
  }
  for (const kind of productKinds) {
    if (!dependenciesValid(kind, products[kind]!, products)) {
      throw new Error('PRODUCT_DEPENDENCY_MISMATCH')
    }
  }
  return products as Record<ProductKind, RuntimeProduct>
}

export function readActiveProductSet(projectRootInput: string): ActiveProductSet {
  const projectRoot = runtimeDirectory(projectRootInput, 'PROJECT_ROOT_INVALID')
  const dataRoot = path.join(projectRoot, 'data')
  const previous = (() => {
    try { return previousState(dataRoot) }
    catch { return 'invalid' as const }
  })()
  const lockPath = path.join(dataRoot, '.catalog.lock')
  if (fs.existsSync(lockPath)) {
    const status = missingProduct('invalid', 'catalog_recovery_required')
    return {
      state: 'recovery_required',catalog: null,products: null,
      status: {
        catalog: dataCatalogStatusSchema.parse({ state: 'recovery_required',previous,transactionId: null }),
        products: allProductStatuses(status),
      },
    }
  }
  const filename = path.join(dataRoot, 'catalog.current.json')
  if (!fs.existsSync(filename)) {
    const status = missingProduct('missing', 'catalog_missing')
    return {
      state: 'missing',catalog: null,products: null,
      status: {
        catalog: dataCatalogStatusSchema.parse({ state: 'missing',previous,transactionId: null }),
        products: allProductStatuses(status),
      },
    }
  }
  try {
    const catalog = productCatalogSchema.parse(runtimeJson(filename, 'CATALOG_CURRENT_INVALID'))
    if (runtimeDigestText(productBundleSetCanonicalText(catalog.products)) !== catalog.bundleSetSha256) {
      throw new Error('CATALOG_BUNDLE_SET_MISMATCH')
    }
    const products: Partial<Record<ProductKind, RuntimeProduct>> = {}
    const statuses = {} as Record<ProductKind, DataProductStatus>
    for (const kind of productKinds) {
      try {
        const product = readProduct(dataRoot, catalog, kind)
        products[kind] = product
        try {
          validateRuntimeProductDomain(kind, product)
          statuses[kind] = manifestStatus(product)
        } catch {
          delete products[kind]
          statuses[kind] = manifestStatus(product, 'invalid', 'product_domain_invalid')
        }
      } catch {
        delete products[kind]
        statuses[kind] = missingProduct('invalid', 'product_invalid')
      }
    }
    for (const kind of productKinds) {
      const product = products[kind]
      if (!product || dependenciesValid(kind, product, products)) continue
      delete products[kind]
      statuses[kind] = manifestStatus(product, 'dependency_mismatch', 'dependency_mismatch')
    }
    return {
      state: 'ready',catalog,products,
      status: {
        catalog: dataCatalogStatusSchema.parse({
          state: 'ready',previous,transactionId: catalog.transactionId,
        }),
        products: statuses,
      },
    }
  } catch {
    const status = missingProduct('invalid', 'catalog_invalid')
    return {
      state: 'invalid',catalog: null,products: null,
      status: {
        catalog: dataCatalogStatusSchema.parse({ state: 'invalid',previous,transactionId: null }),
        products: allProductStatuses(status),
      },
    }
  }
}

export function resolveActiveEntrypoint(
  active: ActiveProductSet,
  kind: ProductKind,
  name: string,
) {
  if (active.state !== 'ready' || !active.products) throw new Error('DATA_PRODUCT_UNAVAILABLE')
  const product = active.products[kind]
  if (!product) throw new Error('DATA_PRODUCT_UNAVAILABLE')
  const relativePath = product.manifest.entrypoints[name]
  if (!relativePath) throw new Error('DATA_ENTRYPOINT_UNAVAILABLE')
  return resolveActiveProductFile(active, kind, relativePath)
}

export function resolveActiveProductFile(
  active: ActiveProductSet,
  kind: ProductKind,
  relativePath: string,
) {
  if (active.state !== 'ready' || !active.products) throw new Error('DATA_PRODUCT_UNAVAILABLE')
  const product = active.products[kind]
  if (!product) throw new Error('DATA_PRODUCT_UNAVAILABLE')
  const evidence = product.manifest.files.find((file) => file.relativePath === relativePath)
  if (!evidence) throw new Error('DATA_PRODUCT_FILE_UNAVAILABLE')
  const target = path.resolve(product.root, ...relativePath.split('/'))
  const real = fs.realpathSync(target)
  const stat = fs.lstatSync(real)
  if (!runtimeContained(product.root, real) || !stat.isFile() || stat.isSymbolicLink()
    || stat.size !== evidence.size || runtimeDigestFile(real) !== evidence.sha256) {
    throw new Error('DATA_ENTRYPOINT_INVALID')
  }
  return real
}
