import fs from 'node:fs'
import path from 'node:path'
import type { ProductManifest } from '../../shared/contracts/productCatalog.js'
import { validateLibraryManifest } from '../libraryManifestValidation.js'
import {
  containedPath,
  productReceiptDigest,
  productRecord,
  readProductJson,
} from './productAdapterSupport.js'
import { digestFile, strictRealDirectory } from './productFiles.js'

export function validateLibraryProductBundle(
  bundleDirInput: string,
  projectRootInput: string,
): Pick<ProductManifest,
  'runId' | 'domainSchemaVersion' | 'createdAt' | 'domainReceiptSha256'
  | 'entrypoints' | 'dependencies' | 'counts'
> {
  const bundleDir = strictRealDirectory(bundleDirInput, 'LIBRARY_PRODUCT_ROOT_INVALID')
  const projectRoot = strictRealDirectory(projectRootInput, 'LIBRARY_PROJECT_ROOT_INVALID')
  const manifestPath = path.join(bundleDir, 'manifest.json')
  const receiptPath = path.join(bundleDir, 'receipt.json')
  const manifest = validateLibraryManifest(readProductJson(manifestPath))
  const receipt = productRecord(readProductJson(receiptPath), 'LIBRARY_RECEIPT_INVALID')
  if (receipt.formatVersion !== 1 || receipt.bundle !== 'library.next'
    || receipt.manifestFile !== 'manifest.json' || typeof receipt.runId !== 'string'
    || receipt.manifestSha256 !== digestFile(manifestPath).slice('sha256:'.length)
    || receipt.completedCopies !== receipt.plannedCopies) throw new Error('LIBRARY_RECEIPT_INVALID')
  for (const file of manifest.files) {
    const target = path.resolve(projectRoot, ...file.archivePath.split('/'))
    const real = fs.realpathSync(target)
    const stat = fs.lstatSync(real)
    if (!containedPath(projectRoot, real) || !stat.isFile() || stat.isSymbolicLink()
      || stat.size !== file.size) throw new Error('LIBRARY_ARCHIVE_EVIDENCE_INVALID')
    if (digestFile(real).slice('sha256:'.length) !== file.sha256) {
      throw new Error('LIBRARY_ARCHIVE_DIGEST_MISMATCH')
    }
  }
  return {
    runId: receipt.runId,domainSchemaVersion: 1,createdAt: manifest.generatedAt,
    domainReceiptSha256: productReceiptDigest({
      manifestSha256: digestFile(manifestPath),receiptSha256: digestFile(receiptPath),
    }),
    entrypoints: { manifest: 'manifest.json',receipt: 'receipt.json' },dependencies: {},
    counts: { files: manifest.files.length,bytes: manifest.stats.bytes },
  }
}
