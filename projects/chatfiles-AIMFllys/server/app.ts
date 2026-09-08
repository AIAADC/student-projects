import fs from 'node:fs'
import path from 'node:path'

import express, { type Router } from 'express'

import aiRouter from './routes/ai.js'
import aiAgentRouter from './routes/aiAgent.js'
import { createDataRouter } from './routes/data.js'
import { createInsightsRouter } from './routes/insights.js'
import { createLocalApiRouter } from './routes/localApi.js'
import { createWechatRouter } from './routes/wechat.js'
import { createRuntimeFileApplicationService } from './application/files/runtimeFileApplicationService.js'
import { createFileRoutes } from './http/files/fileRoutes.js'
import { createOperationRoutes } from './http/operations/operationRoutes.js'
import { createRuntimeLocalOperationExecutor } from './services/localAccessRuntime.js'
import { root } from './utils/helpers.js'

export type AppOptions = {
  projectRoot?: string
  wechatRouter?: Router
  dataRouter?: Router
  insightsRouter?: Router
  aiRouter?: Router
  aiAgentRouter?: Router
  localApiRouter?: Router
  fileRouter?: Router
  operationRouter?: Router
}

export function createApp(options: AppOptions = {}) {
  const projectRoot = options.projectRoot ?? root
  const app = express()
  app.use('/api/ai', express.json({ limit: '2mb' }))
  app.use('/api/v1/operations', express.json({ limit: '256kb' }))
  app.use(express.json({ limit: '24mb' }))

  app.use(options.localApiRouter ?? createLocalApiRouter({ projectRoot }))
  app.use(options.operationRouter ?? createOperationRoutes({
    executor: createRuntimeLocalOperationExecutor(projectRoot),
  }))
  app.use(options.dataRouter ?? createDataRouter(projectRoot))
  app.use(options.fileRouter ?? createFileRoutes({
    service: createRuntimeFileApplicationService(projectRoot),
  }))
  app.use(options.wechatRouter ?? createWechatRouter({}, projectRoot))
  app.use(options.insightsRouter ?? createInsightsRouter(projectRoot))
  app.use(options.aiAgentRouter ?? aiAgentRouter)
  app.use(options.aiRouter ?? aiRouter)

  app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
    const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined
    if (type === 'entity.too.large') {
      return response.status(413).json({ error: 'Request failed', code: 'body_too_large' })
    }
    if (type === 'entity.parse.failed') {
      return response.status(400).json({ error: 'Request failed', code: 'invalid_json_body' })
    }
    if (response.headersSent) return next(error)
    return response.status(500).json({ error: 'Request failed', code: 'internal_error' })
  })

  app.use('/api', (_request, response) => response.status(404).json({
    error: 'Request failed',
    code: 'not_found',
  }))

  app.use('/docs', express.static(path.join(projectRoot, 'docs')))
  app.use(
    '/replication',
    express.static(path.join(projectRoot, 'replication'), {
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('.md')) response.type('text/markdown; charset=utf-8')
      },
    }),
  )

  const dist = path.join(projectRoot, 'dist')
  if (fs.existsSync(dist)) {
    app.use(express.static(dist))
    app.use((_request, response) => response.sendFile('index.html', { root: dist }))
  } else {
    app.use((_request, response) => response.status(503).json({
      error: 'Request failed',
      code: 'build_unavailable',
    }))
  }
  return app
}
