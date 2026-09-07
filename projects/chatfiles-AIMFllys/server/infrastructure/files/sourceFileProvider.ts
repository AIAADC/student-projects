import fs from 'node:fs'
import path from 'node:path'

import type { SourceFileManifest, SourceIndexedFile } from '../../../shared/contracts/files.js'
import type { FileDescriptor, FileOperation } from '../../domain/files/fileCapabilityPolicy.js'

export type ResolvedSourceFile = { descriptor: FileDescriptor; target: string; item: SourceIndexedFile }
export type SourceFileProvider = {
  describe: (id: string) => FileDescriptor | null
  open: (id: string, operation: FileOperation) =>
    | { status: 'available'; target: string }
    | { status: 'invalid' | 'not_found' | 'unavailable' }
  resolve: (id: string) => ResolvedSourceFile | null
}

function descriptor(item: SourceIndexedFile): FileDescriptor {
  return {
    ref: { scope: 'source', id: item.id },
    name: item.name,
    preview: item.preview,
    size: item.size,
    voiceSource: item.preview === 'voice' || /\.(?:amr|silk)$/iu.test(item.name),
    artifactCapabilities: [],
  }
}

function inside(root: string, target: string) {
  const relative = path.relative(root, target)
  return Boolean(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}

function portable(value: string) {
  return value.replaceAll(path.sep, '/')
}

function resolveItem(item: SourceIndexedFile, roots: readonly string[]): ResolvedSourceFile | null {
  try {
    const target = path.resolve(item.sourcePath)
    const indexedRoot = path.resolve(item.root)
    if (!roots.some((root) => path.resolve(root) === indexedRoot) || !inside(indexedRoot, target)) return null
    if (portable(path.relative(indexedRoot, target)) !== item.relativePath.replaceAll('\\', '/')) return null

    const rootStat = fs.lstatSync(indexedRoot)
    const targetStat = fs.lstatSync(target)
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || !targetStat.isFile() || targetStat.isSymbolicLink()) return null
    if (targetStat.size !== item.size || targetStat.mtime.toISOString() !== item.modified) return null

    const realRoot = fs.realpathSync(indexedRoot)
    const realTarget = fs.realpathSync(target)
    if (!inside(realRoot, realTarget)) return null
    return {
      target: realTarget,
      item,
      descriptor: descriptor(item),
    }
  } catch {
    return null
  }
}

export function createSourceFileProvider(manifest: SourceFileManifest): SourceFileProvider {
  const byId = new Map<string, SourceIndexedFile | null>()
  for (const item of manifest.files) byId.set(item.id, byId.has(item.id) ? null : item)
  return {
    describe(id: string) {
      if (!/^[0-9a-f]{20}$/u.test(id)) return null
      const item = byId.get(id)
      return item ? descriptor(item) : null
    },
    open(id: string) {
      if (!/^[0-9a-f]{20}$/u.test(id)) return { status: 'invalid' as const }
      const item = byId.get(id)
      if (!item) return { status: 'not_found' as const }
      const resolved = resolveItem(item, manifest.roots)
      return resolved
        ? { status: 'available' as const, target: resolved.target }
        : { status: 'unavailable' as const }
    },
    resolve(id) {
      if (!/^[0-9a-f]{20}$/u.test(id)) return null
      const item = byId.get(id)
      return item ? resolveItem(item, manifest.roots) : null
    },
  }
}
