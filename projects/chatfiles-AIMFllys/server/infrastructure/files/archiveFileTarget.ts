import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { LibraryFile } from '../../../shared/contracts/files.js'

function digestRegularFile(filename: string) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  const handle = fs.openSync(filename, 'r')
  try {
    let read = 0
    do {
      read = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (read > 0) hash.update(buffer.subarray(0, read))
    } while (read > 0)
  } finally { fs.closeSync(handle) }
  return hash.digest('hex')
}

export function resolveArchiveTarget(projectRoot: string, item: LibraryFile) {
  try {
    const archiveRoot = path.resolve(projectRoot, 'archive')
    const stat = fs.lstatSync(archiveRoot)
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null
    const archiveReal = fs.realpathSync(archiveRoot)
    const target = path.resolve(projectRoot, ...item.archivePath.split('/'))
    const lexical = path.relative(archiveRoot, target)
    if (!lexical || lexical === '..' || lexical.startsWith(`..${path.sep}`) || path.isAbsolute(lexical)) return null
    const targetStat = fs.lstatSync(target)
    if (!targetStat.isFile() || targetStat.isSymbolicLink() || targetStat.size !== item.size) return null
    const real = fs.realpathSync(target)
    const relative = path.relative(archiveReal, real)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative) || digestRegularFile(real) !== item.sha256) return null
    return real
  } catch { return null }
}
