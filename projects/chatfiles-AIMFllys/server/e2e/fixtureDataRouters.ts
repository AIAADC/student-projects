import { createInsightsRouter } from '../routes/insights.js'

export function createFixtureInsightsRouter() {
  return createInsightsRouter(process.cwd(), {
    overview: () => ({
      chat: { conversations: 0,messages: 0,textMessages: 0,contacts: 0 },
      files: { archived: 0,indexed: 0,bytes: 0 },
      insights: { conversations: 0,nuggets: 0 },
    }),
    insights: () => ({
      convCount: 0,nuggetCount: 0,byCategory: {},summaries: [],boards: {},
    }),
  })
}
