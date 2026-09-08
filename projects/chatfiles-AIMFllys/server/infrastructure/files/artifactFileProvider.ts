import type {
  ArtifactSourceAsset,
  ArtifactSourceResolution,
  ArtifactSourceResolver,
} from '../../wechat/artifactSourceResolver.js'
import type {
  ArtifactFileCapability,
  FileDescriptor,
  FileOperation,
} from '../../domain/files/fileCapabilityPolicy.js'

function descriptor(asset: ArtifactSourceAsset, capabilities: ArtifactFileCapability[]): FileDescriptor {
  return {
    ref: { scope: 'artifact', id: asset.id },
    name: asset.name,
    preview: asset.preview,
    size: asset.size ?? 0,
    voiceSource: asset.kind === 'voice',
    artifactCapabilities: capabilities,
  }
}

function mapResolution(result: ArtifactSourceResolution) {
  if (result.status === 'malformed') return { status: 'invalid' as const }
  if (result.status === 'unknown') return { status: 'not_found' as const }
  if (result.status === 'available') return { status: 'available' as const, target: result.target }
  if (result.status === 'unsupported') return { status: 'unsupported' as const, state: result.state }
  if (result.status === 'configuration_unavailable') {
    return { status: 'unavailable' as const, state: 'configuration_unavailable' }
  }
  return { status: 'unavailable' as const, state: result.state }
}

export function createArtifactFileProvider(resolver: ArtifactSourceResolver) {
  return {
    async describe(id: string) {
      const described = resolver.describe(id)
      if (described.status !== 'known') return null
      const asset = described.asset
      const capabilities: ArtifactFileCapability[] = []
      if (asset.kind === 'resource' || asset.kind === 'voice') {
        capabilities.push('content', 'inspect')
        if (asset.preview === 'archive' || /\.(?:zip|rar|7z)$/iu.test(asset.name)) capabilities.push('archive')
      }
      if (asset.preview === 'image' || asset.preview === 'video') capabilities.push('thumbnail')
      return descriptor(asset, capabilities)
    },
    async open(id: string, operation: FileOperation) {
      if (operation === 'databasePreview' || operation === 'textPreview') {
        return { status: 'unsupported' as const }
      }
      return mapResolution(resolver.resolve(id, operation === 'thumbnail' ? 'thumbnail' : 'content'))
    },
  }
}
