import express, { Router, type Request, type Response } from 'express'

import { OperationExecutionError } from '../../application/operationExecutor.js'

type OperationExecutor = { execute: (name: string, input: unknown) => Promise<unknown> }
type OperationRoutesOptions = { executor: OperationExecutor }

function statusFor(error: OperationExecutionError) {
  if (error.code === 'invalid_input') return 400
  if (error.code === 'unknown_operation' || error.code === 'not_found') return 404
  return 503
}

function publicCode(error: OperationExecutionError) {
  return error.code === 'unknown_operation' ? 'not_found' : error.code
}

function route(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      return response.json(await handler(request))
    } catch (error) {
      const safe = error instanceof OperationExecutionError
        ? error
        : new OperationExecutionError('operation_failed')
      return response.status(statusFor(safe)).json({
        error: 'Request failed',
        code: publicCode(safe),
      })
    }
  }
}

function parameter(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

export function createOperationRoutes(options: OperationRoutesOptions) {
  const router = Router()
  router.use('/api/v1/operations', express.json({ limit: '256kb' }))
  router.get('/api/v1/status', route(async () => await options.executor.execute('status', {})))
  router.post('/api/v1/operations/:name', route(async (request) => (
    await options.executor.execute(parameter(request.params.name), request.body)
  )))
  return router
}
