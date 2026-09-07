import { Router } from 'express'

export function createFixtureInsightsRouter() {
  const router = Router()
  router.get(['/api/overview', '/api/v1/overview'], (_request, response) => response.json({
    chat: { conversations: 0,messages: 0,textMessages: 0,contacts: 0 },
    files: { archived: 0,indexed: 0,bytes: 0 },
    insights: { conversations: 0,nuggets: 0 },
  }))
  router.get(['/api/insights', '/api/v1/insights'], (_request, response) => response.json({
    convCount: 0,nuggetCount: 0,byCategory: {},summaries: [],boards: {},
  }))
  return router
}
