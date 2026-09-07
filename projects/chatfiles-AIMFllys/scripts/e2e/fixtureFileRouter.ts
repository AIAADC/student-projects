import path from 'node:path'
import { Router } from 'express'

export function createFixtureFileRouter(assetId: string, target: string) {
  const router = Router()
  router.get('/api/v1/files/artifact/:id/content', (request, response) => {
    if (request.params.id !== assetId) {
      response.status(404).json({ error: 'Request failed', code: 'file_not_found' })
      return
    }
    response.type('text/html').sendFile(path.resolve(target))
  })
  return router
}
