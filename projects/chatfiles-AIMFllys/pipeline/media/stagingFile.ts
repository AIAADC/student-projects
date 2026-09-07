import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export function validateMediaAssetId(assetId: string) {
  if (!/^[a-f0-9]{64}$/u.test(assetId)) throw new Error('MEDIA_ASSET_ID_INVALID')
}

export function prepareMediaStaging(stagingDir: string) {
  const root = fs.realpathSync(stagingDir)
  if (!fs.statSync(root).isDirectory()) throw new Error('MEDIA_STAGING_PATH_UNSAFE')
  const mediaDir = path.resolve(root, 'media')
  const relative = path.relative(root, mediaDir)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('MEDIA_STAGING_PATH_UNSAFE')
  }
  fs.mkdirSync(mediaDir, { recursive: true })
  if (fs.realpathSync(mediaDir) !== mediaDir) throw new Error('MEDIA_STAGING_PATH_UNSAFE')
  return { root, mediaDir }
}

export function mediaStagingPath(root: string, assetId: string, extension: string) {
  validateMediaAssetId(assetId)
  if (!/^[a-z0-9]+$/u.test(extension)) throw new Error('MEDIA_EXTENSION_INVALID')
  const relativePath = `media/${assetId}.${extension}`
  const absolutePath = path.resolve(root, ...relativePath.split('/'))
  const relative = path.relative(root, absolutePath)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('MEDIA_STAGING_PATH_UNSAFE')
  }
  return { absolutePath, relativePath }
}

export function digestBytes(bytes: Uint8Array) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

export function removeStagingFile(filename: string) {
  try {
    fs.unlinkSync(filename)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw new Error('MEDIA_STAGING_CLEANUP_FAILED', { cause: error })
  }
}
