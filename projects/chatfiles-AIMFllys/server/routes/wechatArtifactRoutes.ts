import fs from 'node:fs'
import type { Router } from 'express'
import type { ChatArtifactAvailability, ChatArtifactCapability } from '../../shared/contracts/chat.js'
import {
  createFileApplicationService,
  FileApplicationError,
} from '../application/files/fileApplicationService.js'
import { createArtifactFileProvider } from '../infrastructure/files/artifactFileProvider.js'
import { inspectArchive, inspectFile } from '../utils/inspect.js'
import {
  createArtifactSourceResolver,
  type ArtifactSourceResolver,
} from '../wechat/artifactSourceResolver.js'
import {
  assetResultError,
  byteRangeSatisfiable,
  clearFileRepresentationHeaders,
  parseThumbnailWidth,
  publicMetadata,
  sendError,
  sendPrivateFile,
  setPrivateFileHeaders,
  type WechatRouterDependencies,
} from './wechatRouteHelpers.js'

function fileService(resolver: ArtifactSourceResolver, deps: WechatRouterDependencies) {
  const unsupported = () => { throw new Error('unsupported_file_operation') }
  return createFileApplicationService({
    providers: { artifact: createArtifactFileProvider(resolver) },
    limits: { maxArchiveBytes: 512 * 1024 * 1024, maxTextBytes: 5 * 1024 * 1024 },
    adapters: {
      readText: async () => unsupported(),
      inspectFile,
      inspectArchive,
      inspectDatabase: unsupported,
      inspectVoice: unsupported,
      thumbnail: (target, width, preview) => {
        try {
          return preview === 'video'
            ? deps.videoThumbnail(target, width)
            : deps.imageThumbnail(target, width)
        } catch {
          throw new FileApplicationError('file_operation_failed')
        }
      },
      transcodeVoice: unsupported,
    },
  })
}

function artifactRef(id: string) {
  return /^[0-9a-f]{64}$/u.test(id) ? { scope: 'artifact' as const, id } : null
}

function routeId(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

function regularFile(target: string) {
  try { return fs.statSync(target).isFile() } catch { return false }
}

function fileError(response: Parameters<typeof sendError>[0], error: unknown) {
  if (!(error instanceof FileApplicationError)) return sendError(response, 503, 'database_unavailable')
  if (error.code === 'invalid_file_reference') return sendError(response, 400, 'malformed_asset_id')
  if (error.code === 'file_not_found') return sendError(response, 404, 'asset_not_found')
  if (error.code === 'unsupported_file_capability') return sendError(response, 415, 'operation_unsupported')
  if (error.state === 'configuration_unavailable') {
    return sendError(response, 503, 'configuration_unavailable')
  }
  return sendError(
    response,
    409,
    'source_unavailable',
    error.state as ChatArtifactAvailability | undefined,
  )
}

export function registerWechatArtifactRoutes(router: Router, deps: WechatRouterDependencies) {
  router.get([
    '/api/wechat/artifact/:id/metadata',
    '/api/v1/chat/artifacts/:id/metadata',
  ], (request, response) => {
    const artifactId = routeId(request.params.id)
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    try {
      const resolver = createArtifactSourceResolver({
        assetDb: lease.db,accountRootProvider: deps.accountRootProvider,bundleRoot: lease.bundleRoot ?? undefined,
      })
      const content = resolver.resolve(artifactId, 'content')
      if (content.status === 'malformed' || content.status === 'unknown') return assetResultError(response, content)
      let availability = content.state
      const base = `/api/v1/chat/artifacts/${content.asset.id}`
      const capabilities: ChatArtifactCapability = { metadata: `${base}/metadata` }
      if (content.status === 'available') capabilities.content = `${base}/content`
      if (content.asset.preview === 'image' || content.asset.preview === 'video') {
        const thumbnail = resolver.resolve(artifactId, 'thumbnail')
        if (thumbnail.status === 'available') {
          capabilities.thumbnail = `${base}/thumbnail`
          if (content.status !== 'available') availability = thumbnail.state
        } else if (content.status === 'available' && thumbnail.status === 'unavailable') {
          availability = thumbnail.state
          delete capabilities.content
        }
      }
      return response.json(publicMetadata(content.asset, availability, capabilities))
    } catch {
      return sendError(response, 503, 'database_unavailable')
    } finally {
      lease.release()
    }
  })

  router.get([
    '/api/wechat/artifact/:id/inspect',
    '/api/v1/chat/artifacts/:id/inspect',
  ], async (request, response) => {
    const ref = artifactRef(routeId(request.params.id))
    if (!ref) return sendError(response, 400, 'malformed_asset_id')
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    try {
      const resolver = createArtifactSourceResolver({
        assetDb: lease.db,accountRootProvider: deps.accountRootProvider,bundleRoot: lease.bundleRoot ?? undefined,
      })
      const inspected = await fileService(resolver, deps).inspect(ref)
      return response.json({ ...inspected, path: '' })
    } catch (error) {
      return fileError(response, error)
    } finally {
      lease.release()
    }
  })

  router.get([
    '/api/wechat/artifact/:id/archive',
    '/api/v1/chat/artifacts/:id/archive',
  ], async (request, response) => {
    const ref = artifactRef(routeId(request.params.id))
    if (!ref) return sendError(response, 400, 'malformed_asset_id')
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    try {
      const resolver = createArtifactSourceResolver({
        assetDb: lease.db,accountRootProvider: deps.accountRootProvider,bundleRoot: lease.bundleRoot ?? undefined,
      })
      const preview = await fileService(resolver, deps).readArchive(ref)
      return response.json({ ...preview, path: '', ...(preview.readable ? {} : { error: '压缩包目录不可读' }) })
    } catch (error) {
      return fileError(response, error)
    } finally {
      lease.release()
    }
  })

  router.get([
    '/api/wechat/artifact/:id/content',
    '/api/v1/chat/artifacts/:id/content',
  ], async (request, response) => {
    const ref = artifactRef(routeId(request.params.id))
    if (!ref) return sendError(response, 400, 'malformed_asset_id')
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    try {
      const resolver = createArtifactSourceResolver({
        assetDb: lease.db,accountRootProvider: deps.accountRootProvider,bundleRoot: lease.bundleRoot ?? undefined,
      })
      const opened = await fileService(resolver, deps).openContent(ref)
      const range = byteRangeSatisfiable(request.headers.range, opened.target)
      if (!range.ok) {
        setPrivateFileHeaders(response)
        response.setHeader('Content-Range', `bytes */${range.size}`)
        return sendError(response, 416, 'range_not_satisfiable')
      }
      return sendPrivateFile(response, { target: opened.target, name: opened.descriptor.name })
    } catch (error) {
      return fileError(response, error)
    } finally {
      lease.release()
    }
  })

  router.get([
    '/api/wechat/artifact/:id/thumbnail',
    '/api/v1/chat/artifacts/:id/thumbnail',
  ], async (request, response) => {
    const width = parseThumbnailWidth(request.query.w)
    if (width === null) return sendError(response, 400, 'invalid_thumbnail_width')
    const ref = artifactRef(routeId(request.params.id))
    if (!ref) return sendError(response, 400, 'malformed_asset_id')
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    try {
      const resolver = createArtifactSourceResolver({
        assetDb: lease.db,accountRootProvider: deps.accountRootProvider,bundleRoot: lease.bundleRoot ?? undefined,
      })
      const opened = await fileService(resolver, deps).openThumbnail(
        ref,
        width,
      )
      if (!regularFile(opened.target)) {
        return sendError(response, 409, 'source_unavailable', 'source_unavailable')
      }
      setPrivateFileHeaders(response)
      response.type('image/webp')
      return response.sendFile(opened.target, (error) => {
        if (!error) return
        if (response.headersSent) {
          if (!response.writableEnded) response.end()
          return
        }
        clearFileRepresentationHeaders(response)
        sendError(response, 409, 'source_unavailable', 'source_unavailable')
      })
    } catch (error) {
      if (error instanceof FileApplicationError && error.code === 'file_operation_failed') {
        return sendError(response, 415, 'thumbnail_unavailable', 'unsupported_codec')
      }
      return fileError(response, error)
    } finally {
      lease.release()
    }
  })
}
