import type { LibraryFile, LibraryManifest } from '../../../shared/contracts/files.js'
import type { FileDescriptor } from '../../domain/files/fileCapabilityPolicy.js'
import { resolveArchiveTarget } from './archiveFileTarget.js'

function descriptor(item: LibraryFile): FileDescriptor {
  return {
    ref: { scope: 'archive', id: item.id },
    name: item.name,
    preview: item.preview,
    size: item.size,
    voiceSource: item.preview === 'voice' || /\.(?:amr|silk)$/iu.test(item.name),
    artifactCapabilities: [],
  }
}

export function createArchiveFileProvider(projectRoot: string, manifest: LibraryManifest) {
  const byId = new Map<string, LibraryFile | null>()
  for (const item of manifest.files) byId.set(item.id, byId.has(item.id) ? null : item)
  return {
    async describe(id: string) {
      if (!/^[0-9a-f]{20}$/u.test(id)) return null
      const item = byId.get(id)
      return item ? descriptor(item) : null
    },
    async open(id: string) {
      if (!/^[0-9a-f]{20}$/u.test(id)) return { status: 'invalid' as const }
      const item = byId.get(id)
      if (!item) return { status: 'not_found' as const }
      const target = resolveArchiveTarget(projectRoot, item)
      return target
        ? { status: 'available' as const, target }
        : { status: 'unavailable' as const }
    },
  }
}
