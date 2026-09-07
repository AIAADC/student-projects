import fs from 'node:fs'
import path from 'node:path'
import {
  productKindSchema,
  productManifestSchema,
  productReleaseReceiptSchema,
  productReferenceSchema,
  type ProductKind,
  type ProductManifest,
  type ProductReference,
} from '../../shared/contracts/productCatalog.js'
import { productManifestCanonicalText } from '../../shared/contracts/productCatalogCanonical.js'
import {
  copyProductFiles,
  digestText,
  ensureDataRoleDirectory,
  inventoryProductTree,
  strictRealDirectory,
} from './productFiles.js'

type SealProductInput = Omit<ProductManifest, 'schemaVersion' | 'bundleSha256' | 'files'> & {
  dataRoot: string
  stagingDir: string
}

function serialized(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function bundleDigest(manifest: Omit<ProductManifest, 'bundleSha256'>) {
  return digestText(productManifestCanonicalText(manifest))
}

function productDirectory(dataRoot: string, kind: ProductKind, bundleSha256: string) {
  return path.join(dataRoot, 'products', kind, bundleSha256.slice('sha256:'.length))
}

function contained(parent: string, child: string) {
  const relative = path.relative(parent, child)
  return relative !== '' && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function readManifest(productDir: string) {
  const filename = path.join(productDir, 'product.json')
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PRODUCT_MANIFEST_UNSAFE')
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)))
  } catch (error) {
    throw new Error('PRODUCT_MANIFEST_INVALID', { cause: error })
  }
  return { manifest: productManifestSchema.parse(value),manifestSha256: digestText(fs.readFileSync(filename, 'utf8')) }
}

function readReceipt(productDir: string) {
  const filename = path.join(productDir, 'release.json')
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PRODUCT_RECEIPT_UNSAFE')
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename))
    return { receipt: productReleaseReceiptSchema.parse(JSON.parse(text)),sha256: digestText(text) }
  } catch (error) {
    throw new Error('PRODUCT_RECEIPT_INVALID', { cause: error })
  }
}

function validateDirectory(productDir: string, expected?: ProductReference) {
  const real = strictRealDirectory(productDir, 'PRODUCT_DIRECTORY_UNSAFE')
  const { manifest,manifestSha256 } = readManifest(real)
  const { receipt,sha256: receiptSha256 } = readReceipt(real)
  const files = inventoryProductTree(real).filter((file) => file.relativePath !== 'product.json')
  if (JSON.stringify(files) !== JSON.stringify(manifest.files)) {
    const sameShape = files.length === manifest.files.length && files.every((file, index) => (
      file.relativePath === manifest.files[index]?.relativePath && file.size === manifest.files[index]?.size
    ))
    throw new Error(sameShape ? 'PRODUCT_FILE_DIGEST_MISMATCH' : 'PRODUCT_FILE_INVENTORY_MISMATCH')
  }
  if (bundleDigest(manifest) !== manifest.bundleSha256) throw new Error('PRODUCT_BUNDLE_DIGEST_MISMATCH')
  if (manifest.entrypoints.release !== 'release.json'
    || manifest.domainReceiptSha256 !== receiptSha256
    || receipt.kind !== manifest.kind || receipt.runId !== manifest.runId
    || receipt.domainSchemaVersion !== manifest.domainSchemaVersion
    || receipt.validatedAt !== manifest.createdAt
    || JSON.stringify(receipt.counts) !== JSON.stringify(manifest.counts)) {
    throw new Error('PRODUCT_RECEIPT_BINDING_MISMATCH')
  }
  if (expected && (expected.bundleSha256 !== manifest.bundleSha256
    || expected.manifestSha256 !== manifestSha256)) throw new Error('PRODUCT_REFERENCE_MISMATCH')
  return { manifest,manifestSha256 }
}

export function validateSealedProduct(input: {
  dataRoot: string
  kind: ProductKind
  reference: ProductReference
}) {
  const dataRoot = strictRealDirectory(input.dataRoot, 'PRODUCT_DATA_ROOT_UNSAFE')
  let kind: ProductKind
  let reference: ProductReference
  try {
    kind = productKindSchema.parse(input.kind)
    reference = productReferenceSchema.parse(input.reference)
  } catch (error) {
    throw new Error('PRODUCT_REFERENCE_INVALID', { cause: error })
  }
  const expectedDir = productDirectory(dataRoot, kind, reference.bundleSha256)
  ensureDataRoleDirectory(dataRoot, ['products', kind], {
    create: false,code: 'PRODUCT_OUTPUT_ROLE_INVALID',
  })
  const result = validateDirectory(expectedDir, reference)
  if (result.manifest.kind !== kind) throw new Error('PRODUCT_KIND_MISMATCH')
  return result.manifest
}

export function readSealedProductManifest(input: {
  dataRoot: string
  kind: ProductKind
  reference: ProductReference
}) {
  const dataRoot = strictRealDirectory(input.dataRoot, 'PRODUCT_DATA_ROOT_UNSAFE')
  const kind = productKindSchema.parse(input.kind)
  const reference = productReferenceSchema.parse(input.reference)
  ensureDataRoleDirectory(dataRoot, ['products', kind], {
    create: false,code: 'PRODUCT_OUTPUT_ROLE_INVALID',
  })
  const productDir = strictRealDirectory(
    productDirectory(dataRoot, kind, reference.bundleSha256),
    'PRODUCT_DIRECTORY_UNSAFE',
  )
  const { manifest,manifestSha256 } = readManifest(productDir)
  if (manifest.kind !== kind || manifest.bundleSha256 !== reference.bundleSha256
    || manifestSha256 !== reference.manifestSha256
    || bundleDigest(manifest) !== manifest.bundleSha256) {
    throw new Error('PRODUCT_MANIFEST_BINDING_MISMATCH')
  }
  return manifest
}

export function sealProduct(input: SealProductInput) {
  const dataRoot = strictRealDirectory(input.dataRoot, 'PRODUCT_DATA_ROOT_UNSAFE')
  const sourceRoot = strictRealDirectory(input.stagingDir, 'PRODUCT_STAGING_UNSAFE')
  const stagingRole = strictRealDirectory(
    path.join(dataRoot, 'product-staging'),
    'PRODUCT_STAGING_ROLE_INVALID',
  )
  if (!contained(stagingRole, sourceRoot)) throw new Error('PRODUCT_STAGING_ROLE_INVALID')
  const sourceFiles = inventoryProductTree(sourceRoot)
  if (sourceFiles.some((file) => file.relativePath === 'product.json'
    || file.relativePath === 'release.json') || Object.hasOwn(input.entrypoints, 'release')) {
    throw new Error('PRODUCT_STAGING_MANIFEST_RESERVED')
  }
  const receipt = productReleaseReceiptSchema.parse({
    version: 1,kind: input.kind,runId: input.runId,
    domainSchemaVersion: input.domainSchemaVersion,validatedAt: input.createdAt,
    evidenceSha256: input.domainReceiptSha256,counts: input.counts,
  })
  const receiptText = serialized(receipt)
  const receiptFile = {
    relativePath: 'release.json',size: Buffer.byteLength(receiptText),sha256: digestText(receiptText),
  }
  const files = [...sourceFiles,receiptFile]
    .sort((left, right) => left.relativePath < right.relativePath ? -1 : 1)
  const withoutDigest = {
    schemaVersion: 1 as const,kind: input.kind,runId: input.runId,createdAt: input.createdAt,
    domainSchemaVersion: input.domainSchemaVersion,
    domainReceiptSha256: receiptFile.sha256,entrypoints: { ...input.entrypoints,release: 'release.json' },
    files,dependencies: input.dependencies,counts: input.counts,
  }
  const manifest = productManifestSchema.parse({
    ...withoutDigest,bundleSha256: bundleDigest(withoutDigest),
  })
  const manifestText = serialized(manifest)
  const reference = {
    bundleSha256: manifest.bundleSha256,
    manifestSha256: digestText(manifestText),
  }
  const parent = ensureDataRoleDirectory(dataRoot, ['products', input.kind], {
    create: true,code: 'PRODUCT_OUTPUT_ROLE_INVALID',
  })
  const productDir = path.join(parent, manifest.bundleSha256.slice('sha256:'.length))
  if (fs.existsSync(productDir)) {
    validateDirectory(productDir, reference)
    return { productDir,manifest,reference,reused: true }
  }
  const temporary = path.join(parent, `.${path.basename(productDir)}.${process.pid}.staging`)
  if (fs.existsSync(temporary)) throw new Error('PRODUCT_SEAL_STAGING_EXISTS')
  fs.mkdirSync(temporary)
  try {
    copyProductFiles(sourceRoot, temporary, sourceFiles)
    fs.writeFileSync(path.join(temporary, 'release.json'), receiptText, { encoding: 'utf8',flag: 'wx' })
    fs.writeFileSync(path.join(temporary, 'product.json'), manifestText, { encoding: 'utf8',flag: 'wx' })
    validateDirectory(temporary, reference)
    fs.renameSync(temporary, productDir)
  } catch (error) {
    fs.rmSync(temporary, { recursive: true,force: true })
    throw error
  }
  return { productDir,manifest,reference,reused: false }
}
