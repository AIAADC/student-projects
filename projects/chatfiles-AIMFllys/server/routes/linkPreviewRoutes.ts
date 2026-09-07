import type { Router } from 'express'
import { sendError, type WechatRouterDependencies } from './wechatRouteHelpers.js'

type LinkRow = { category: string; url: string | null }

export function registerLinkPreviewRoutes(router: Router, deps: WechatRouterDependencies) {
  router.get([
    '/api/wechat/artifact/:id/link-preview',
    '/api/v1/chat/artifacts/:id/link-preview',
  ], async (request, response) => {
    const artifactId = typeof request.params.id === 'string' ? request.params.id : ''
    if (!/^[0-9a-f]{64}$/u.test(artifactId)) return sendError(response, 400, 'invalid_asset_id')
    const lease = deps.openArtifactDatabase()
    if (!lease.db) return sendError(response, 503, 'database_unavailable')
    let row: LinkRow | undefined
    try {
      row = lease.db.prepare('SELECT category,url FROM artifacts WHERE asset_id=?').get(artifactId) as LinkRow | undefined
    } catch {
      return sendError(response, 503, 'database_unavailable')
    } finally {
      lease.release()
    }
    if (!row) return sendError(response, 404, 'not_found')
    if (row.category !== 'link' || !row.url) return sendError(response, 415, 'operation_unsupported')
    try {
      return response.json(await deps.resolveLinkPreview(artifactId, row.url))
    } catch {
      return sendError(response, 502, 'preview_unavailable')
    }
  })
}
