import { Router, type Response } from 'express'
import { root } from '../utils/helpers.js'
import {
  createWechatQueryService,
  WechatQueryError,
} from '../application/chat/wechatQueryService.js'
import { openCatalogWechatDatabase } from '../data/productDatabases.js'
import { registerWechatArtifactRoutes } from './wechatArtifactRoutes.js'
import { registerWechatTimelineRoutes } from './wechatTimelineRoutes.js'
import { registerLinkPreviewRoutes } from './linkPreviewRoutes.js'
import {
  defaultDependencies,
  parseCollectionQuery,
  sendError,
  setPrivateFileHeaders,
  validConversationId,
  type WechatRouterDependencies,
} from './wechatRouteHelpers.js'

export type { DatabaseLease, WechatRouterDependencies } from './wechatRouteHelpers.js'

function parameter(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

function queryError(response: Response, error: unknown) {
  if (!(error instanceof WechatQueryError) || error.code === 'unavailable') {
    return sendError(response, 503, 'database_unavailable')
  }
  if (error.code === 'offset_not_satisfiable') {
    return sendError(response, 416, 'offset_not_satisfiable')
  }
  return sendError(response, 404, 'not_found')
}

export function wechatDatabaseResolution(projectRoot = root) {
  const opened = openCatalogWechatDatabase(projectRoot)
  opened.db?.close()
  return { code: opened.code,runId: opened.runId }
}

export function wechatDb(projectRoot = root) {
  return openCatalogWechatDatabase(projectRoot).db
}

export function createWechatRouter(
  dependencies: Partial<WechatRouterDependencies> = {},
  projectRoot = root,
) {
  const deps = { ...defaultDependencies(projectRoot), ...dependencies }
  const queries = createWechatQueryService({
    openWechatDatabase: deps.openWechatDatabase,
    openProductDatabases: deps.openProductDatabases,
  })
  const router = Router()

  router.use((_request, response, next) => {
    setPrivateFileHeaders(response)
    next()
  })

  router.get(['/api/wechat/conversations', '/api/v1/chat/conversations'], (_request, response) => {
    try { return response.json(queries.conversations()) } catch (error) { return queryError(response, error) }
  })

  const collection = (conversationId: string | undefined, requestQuery: Record<string, unknown>, response: Response) => {
    if (conversationId !== undefined && !validConversationId(conversationId)) {
      return sendError(response, 400, 'invalid_conversation_id')
    }
    const input = parseCollectionQuery(requestQuery)
    if (!input) return sendError(response, 400, 'invalid_query')
    try {
      return response.json(queries.artifacts({ ...input, conversationId }))
    } catch (error) { return queryError(response, error) }
  }

  router.get(['/api/wechat/artifacts', '/api/v1/chat/artifacts'], (request, response) => (
    collection(undefined, request.query as Record<string, unknown>, response)
  ))
  router.get([
    '/api/wechat/conversation/:id/artifacts',
    '/api/v1/chat/conversations/:id/artifacts',
  ], (request, response) => (
    collection(parameter(request.params.id), request.query as Record<string, unknown>, response)
  ))

  registerWechatTimelineRoutes(router, queries)
  registerLinkPreviewRoutes(router, deps)
  registerWechatArtifactRoutes(router, deps)
  return router
}

export default createWechatRouter()
