import { Router, type Response } from 'express'

import {
  createRuntimeInsightsQueryService,
  type InsightsQueryService,
} from '../application/insights/insightsQueryService.js'
import { root } from '../utils/helpers.js'

function unavailable(response: Response) {
  return response.status(503).json({ error: 'Request failed', code: 'data_product_unavailable' })
}

export function createInsightsRouter(
  projectRoot = root,
  service: InsightsQueryService = createRuntimeInsightsQueryService(projectRoot),
) {
  const router = Router()
  router.get(['/api/insights', '/api/v1/insights'], (_request, response) => {
    try { return response.json(service.insights()) } catch { return unavailable(response) }
  })
  router.get(['/api/overview', '/api/v1/overview'], (_request, response) => {
    try { return response.json(service.overview()) } catch { return unavailable(response) }
  })
  return router
}

export default createInsightsRouter()
