import path from 'node:path'

import { Router, type Request, type Response } from 'express'
import mime from 'mime'

import {
  FileApplicationError,
  type FileApplicationService,
} from '../../application/files/fileApplicationService.js'
import type { FileRef, FileScope } from '../../domain/files/fileCapabilityPolicy.js'

type FileRoutesOptions = { service: FileApplicationService }
type RefFactory = (request: Request) => FileRef | null

function errorStatus(error: FileApplicationError) {
  if (error.code === 'invalid_file_reference') return 400
  if (error.code === 'file_not_found') return 404
  if (error.code === 'unsupported_file_capability') return 415
  if (error.code === 'preview_blocked') return 413
  if (error.code === 'file_unavailable') return 409
  return 500
}

function route(handler: (request: Request, response: Response) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      await handler(request, response)
    } catch (error) {
      const safe = error instanceof FileApplicationError
        ? error
        : new FileApplicationError('file_operation_failed')
      if (!response.headersSent) {
        response.status(errorStatus(safe)).json({ error: 'Request failed', code: safe.code })
      } else if (!response.writableEnded) response.end()
    }
  }
}

function requiredRef(factory: RefFactory, request: Request) {
  const ref = factory(request)
  if (!ref) throw new FileApplicationError('invalid_file_reference')
  return ref
}

function parameter(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : null
}

function width(request: Request) {
  const value = request.query.w ?? '360'
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 16 && parsed <= 2_000 ? parsed : null
}

function privateFileHeaders(response: Response) {
  response.setHeader('Cache-Control', 'private, no-store')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
}

function sendRepresentation(response: Response, target: string, name: string) {
  privateFileHeaders(response)
  const contentType = mime.getType(target) ?? 'application/octet-stream'
  response.type(contentType)
  if (contentType === 'text/html' || contentType === 'image/svg+xml') {
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox")
    response.attachment(name)
  }
  response.sendFile(path.resolve(target))
}

function registerOperations(router: Router, base: string, refFactory: RefFactory, service: FileApplicationService) {
  router.get(`${base}/text`, route(async (request, response) => {
    const result = await service.readText(requiredRef(refFactory, request))
    response.type('text/plain; charset=utf-8').send(result.text)
  }))
  router.get(`${base}/archive`, route(async (request, response) => {
    response.json(await service.readArchive(requiredRef(refFactory, request)))
  }))
  router.get(`${base}/database`, route(async (request, response) => {
    response.json(await service.readDatabase(requiredRef(refFactory, request)))
  }))
  router.get(`${base}/inspect`, route(async (request, response) => {
    response.json(await service.inspect(requiredRef(refFactory, request)))
  }))
  router.get(`${base}/thumb`, route(async (request, response) => {
    const parsedWidth = width(request)
    if (parsedWidth === null) {
      response.status(400).json({ error: 'Request failed', code: 'invalid_thumbnail_width' })
      return
    }
    const result = await service.openThumbnail(requiredRef(refFactory, request), parsedWidth)
    privateFileHeaders(response)
    if (result.descriptor.ref.scope === 'archive') {
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    response.type('image/webp').sendFile(path.resolve(result.target))
  }))
  router.get(`${base}/voice`, route(async (request, response) => {
    const audioUrl = `${request.path}.wav`
    response.json(await service.readVoice(requiredRef(refFactory, request), audioUrl))
  }))
  router.get(`${base}/voice.wav`, route(async (request, response) => {
    const result = await service.openVoiceAudio(requiredRef(refFactory, request))
    privateFileHeaders(response)
    response.type('audio/wav').sendFile(path.resolve(result.target))
  }))
  router.get(`${base}/content`, route(async (request, response) => {
    const result = await service.openContent(requiredRef(refFactory, request))
    sendRepresentation(response, result.target, result.descriptor.name)
  }))
}

function fixedScope(scope: FileScope): RefFactory {
  return (request) => {
    const id = parameter(request.params.id)
    return id ? { scope, id } : null
  }
}

const validScopes = new Set<FileScope>(['archive', 'source', 'artifact'])
const dynamicScope: RefFactory = (request) => {
  const scope = parameter(request.params.scope) as FileScope | null
  const id = parameter(request.params.id)
  return scope && id && validScopes.has(scope) ? { scope, id } : null
}

export function createFileRoutes(options: FileRoutesOptions) {
  const router = Router()
  registerOperations(router, '/api/file/:id', fixedScope('archive'), options.service)
  registerOperations(router, '/api/source-file/:id', fixedScope('source'), options.service)
  registerOperations(router, '/api/v1/files/:scope/:id', dynamicScope, options.service)
  router.get('/files/:id', route(async (request, response) => {
    const result = await options.service.openContent(requiredRef(fixedScope('archive'), request))
    sendRepresentation(response, result.target, result.descriptor.name)
  }))
  router.get('/source-files/:id', route(async (request, response) => {
    const result = await options.service.openContent(requiredRef(fixedScope('source'), request))
    sendRepresentation(response, result.target, result.descriptor.name)
  }))
  return router
}
