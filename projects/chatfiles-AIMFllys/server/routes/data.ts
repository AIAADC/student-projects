import { Router, type Response } from 'express'

import {
  createRuntimeStaticDataQueryService,
  type StaticDataQueryService,
} from '../application/data/staticDataQueryService.js'
import { root } from '../utils/helpers.js'

const endpoints = [
  ['/api/library', 'library'],
  ['/api/source-library', 'sourceLibrary'],
  ['/api/knowledge', 'knowledge'],
  ['/api/summary', 'summary'],
  ['/api/chat-clues', 'chatClues'],
  ['/api/chat-synthesis', 'chatSynthesis'],
  ['/api/database-analysis', 'databaseAnalysis'],
  ['/api/value-candidates', 'valueCandidates'],
] as const

function unavailable(response: Response) {
  return response.status(503).json({ error: 'Request failed', code: 'data_product_unavailable' })
}

export function createDataRouter(
  projectRoot = root,
  service: StaticDataQueryService = createRuntimeStaticDataQueryService(projectRoot),
) {
  const router = Router()
  for (const [route, operation] of endpoints) {
    const v1Route = `/api/v1/data/${route.slice('/api/'.length)}`
    router.get([route, v1Route], (_request, response) => {
      try { return response.json(service[operation]()) } catch { return unavailable(response) }
    })
  }
  return router
}

export default createDataRouter()
