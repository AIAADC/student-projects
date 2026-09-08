import type {
  ProductCatalog,
  ProductKind,
  ProductManifest,
  ProductReference,
} from './productCatalog.js'

export const productKinds = ['wechat', 'assets', 'library', 'insights'] as const

export function productManifestBody(manifest: Omit<ProductManifest, 'bundleSha256'>) {
  return {
    schemaVersion: manifest.schemaVersion,
    kind: manifest.kind,
    runId: manifest.runId,
    domainSchemaVersion: manifest.domainSchemaVersion,
    createdAt: manifest.createdAt,
    domainReceiptSha256: manifest.domainReceiptSha256,
    entrypoints: manifest.entrypoints,
    files: manifest.files,
    dependencies: manifest.dependencies,
    counts: manifest.counts,
  }
}

export function productManifestCanonicalText(manifest: Omit<ProductManifest, 'bundleSha256'>) {
  return JSON.stringify(productManifestBody(manifest))
}

export function productBundleSetCanonicalText(products: Record<ProductKind, ProductReference>) {
  return JSON.stringify(productKinds.map((kind) => [kind, products[kind]]))
}

export function productCatalogCanonicalText(catalog: ProductCatalog) {
  return JSON.stringify(catalog)
}
