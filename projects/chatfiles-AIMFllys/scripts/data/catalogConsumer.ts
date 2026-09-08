import fs from 'node:fs'
import path from 'node:path'
import type { ProductKind } from '../../shared/contracts/productCatalog.js'
import { libraryManifestSchema } from '../../shared/contracts/files.js'
import { readCatalogLock, readCatalogRole } from './catalogStore.js'
import { validateProductCatalog } from './catalogValidation.js'
import { strictRealDirectory } from './productFiles.js'

export function resolveCurrentProductEntrypoint(
  dataRootInput: string,
  kind: ProductKind,
  name: string,
) {
  const dataRoot = strictRealDirectory(dataRootInput, 'CATALOG_DATA_ROOT_UNSAFE')
  if (readCatalogLock(dataRoot)) throw new Error('CATALOG_RECOVERY_REQUIRED')
  const current = readCatalogRole(dataRoot, 'current')
  if (current.state === 'missing') throw new Error('CATALOG_CURRENT_MISSING')
  if (current.state !== 'ready' || !current.catalog) throw new Error('CATALOG_CURRENT_INVALID')
  const validated = validateProductCatalog(dataRoot, current.catalog)
  const manifest = validated.manifests[kind]
  const relativePath = manifest.entrypoints[name]
  const evidence = manifest.files.find((file) => file.relativePath === relativePath)
  if (!relativePath || !evidence) throw new Error('PRODUCT_ENTRYPOINT_MISSING')
  const productRoot = path.join(dataRoot, 'products', kind, manifest.bundleSha256.slice(7))
  const target = path.resolve(productRoot, ...relativePath.split('/'))
  const real = fs.realpathSync(target)
  const stat = fs.lstatSync(real)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== evidence.size) {
    throw new Error('PRODUCT_ENTRYPOINT_INVALID')
  }
  return real
}

export function readCurrentLibraryManifest(projectRootInput: string) {
  const projectRoot = strictRealDirectory(projectRootInput, 'PROJECT_ROOT_INVALID')
  const filename = resolveCurrentProductEntrypoint(
    path.join(projectRoot, 'data'),'library','manifest',
  )
  try {
    return libraryManifestSchema.parse(JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename)),
    ))
  } catch (error) {
    throw new Error('LIBRARY_PRODUCT_INVALID', { cause: error })
  }
}
