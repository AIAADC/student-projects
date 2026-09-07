import {
  productCatalogSchema,
  type ProductCatalog,
  type ProductKind,
  type ProductManifest,
  type ProductReference,
} from '../../shared/contracts/productCatalog.js'
import {
  productBundleSetCanonicalText,
  productCatalogCanonicalText,
  productKinds,
} from '../../shared/contracts/productCatalogCanonical.js'
import { digestText, strictRealDirectory } from './productFiles.js'
import { validateSealedProduct } from './productSealer.js'
import { validateCatalogProductDomains } from './catalogDomainValidation.js'

export function bundleSetSha256(products: Record<ProductKind, ProductReference>) {
  return digestText(productBundleSetCanonicalText(products))
}

export function catalogSha256(catalog: ProductCatalog) {
  return digestText(productCatalogCanonicalText(productCatalogSchema.parse(catalog)))
}

function verifyDependency(
  dependencyKind: ProductKind,
  dependency: ProductManifest['dependencies'][ProductKind],
  manifests: Record<ProductKind, ProductManifest>,
) {
  if (!dependency) return
  const target = manifests[dependencyKind]
  const file = target.files.find((candidate) => candidate.relativePath === dependency.entrypoint)
  if (dependency.bundleSha256 !== target.bundleSha256
    || !file || file.sha256 !== dependency.entrypointSha256
    || dependency.runId !== target.runId
    || dependency.domainSchemaVersion !== target.domainSchemaVersion
    || dependency.domainReceiptSha256 !== target.domainReceiptSha256) {
    throw new Error('PRODUCT_DEPENDENCY_MISMATCH')
  }
}

export function validateProductCatalog(dataRootInput: string, value: unknown) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  let catalog: ProductCatalog
  try {
    catalog = productCatalogSchema.parse(value)
  } catch (error) {
    throw new Error('CATALOG_SCHEMA_INVALID', { cause: error })
  }
  if (bundleSetSha256(catalog.products) !== catalog.bundleSetSha256) {
    throw new Error('CATALOG_BUNDLE_SET_MISMATCH')
  }
  const manifests = {} as Record<ProductKind, ProductManifest>
  for (const kind of productKinds) {
    manifests[kind] = validateSealedProduct({ dataRoot,kind,reference: catalog.products[kind] })
  }
  validateCatalogProductDomains(dataRoot, manifests)
  if (!manifests.assets.dependencies.wechat || !manifests.insights.dependencies.wechat) {
    throw new Error('PRODUCT_DEPENDENCY_MISSING')
  }
  for (const kind of productKinds) {
    for (const dependencyKind of productKinds) {
      verifyDependency(dependencyKind, manifests[kind].dependencies[dependencyKind], manifests)
    }
  }
  return { catalog,manifests,sha256: catalogSha256(catalog) }
}
