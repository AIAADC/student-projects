import { createHash, timingSafeEqual } from 'node:crypto'
import { Router, type Request, type Response } from 'express'
import { createRuntimeLocalAccessService } from '../services/localAccessRuntime.js'
import { LocalAccessError, type LocalAccessService } from '../services/localAccess.js'

type Options = { service?: LocalAccessService; token?: string; projectRoot?: string }

function authorized(header: string | undefined, token: string) {
  if (!token) return true
  const expected = createHash('sha256').update(`Bearer ${token}`, 'utf8').digest()
  const actual = createHash('sha256').update(header ?? '', 'utf8').digest()
  return timingSafeEqual(expected, actual)
}

function query(request: Request, allowed: readonly string[]) {
  const keys = Object.keys(request.query)
  if (keys.some((key) => !allowed.includes(key))) throw new LocalAccessError('invalid_input')
  const result: Record<string, string> = {}
  for (const key of keys) {
    const value = request.query[key]
    if (typeof value !== 'string') throw new LocalAccessError('invalid_input')
    result[key] = value
  }
  return result
}

function number(value: string | undefined) {
  if (value === undefined) return undefined
  if (!/^-?\d+$/u.test(value)) throw new LocalAccessError('invalid_input')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new LocalAccessError('invalid_input')
  return parsed
}

function boundedNumber(value: string | undefined, minimum: number, maximum: number) {
  const parsed = number(value)
  if (parsed !== undefined && (parsed < minimum || parsed > maximum)) {
    throw new LocalAccessError('invalid_input')
  }
  return parsed
}

function parameter(value: string | string[] | undefined) {
  if (typeof value !== 'string') throw new LocalAccessError('invalid_input')
  return value
}

function statusFor(error: LocalAccessError) {
  if (error.code === 'invalid_input') return 400
  if (error.code === 'not_found') return 404
  return 503
}

function codeFor(error: LocalAccessError) {
  if (error.code === 'invalid_input') return 'invalid_local_request'
  if (error.code === 'not_found') return 'local_not_found'
  return error.code
}

function route(handler: (request: Request) => Promise<unknown>) {
  return async (request: Request, response: Response) => {
    try {
      return response.json(await handler(request))
    } catch (error) {
      const safe = error instanceof LocalAccessError ? error : new LocalAccessError('operation_failed')
      return response.status(statusFor(safe)).json({ error: 'Request failed', code: codeFor(safe) })
    }
  }
}

export function createLocalApiRouter(options: Options = {}) {
  const router = Router()
  const service = options.service ?? createRuntimeLocalAccessService(options.projectRoot)
  const token = (options.token ?? process.env.CHATFILES_LOCAL_TOKEN ?? '').trim()
  router.use('/api/local/v1', (request, response, next) => {
    if (authorized(request.header('authorization'), token)) return next()
    response.setHeader('WWW-Authenticate', 'Bearer realm="chatfiles-local"')
    return response.status(401).json({ error: 'Request failed', code: 'local_unauthorized' })
  })
  router.get('/api/local/v1/status', route(async (request) => {
    query(request, [])
    return service.status()
  }))
  router.get('/api/local/v1/conversations', route(async (request) => {
    const value = query(request, ['query', 'limit'])
    return service.conversations({ query: value.query, limit: boundedNumber(value.limit, 1, 100) })
  }))
  router.get('/api/local/v1/search', route(async (request) => {
    const value = query(request, ['q', 'conversation', 'sender', 'after', 'before', 'limit'])
    return service.search({
      query: value.q ?? '', conversationId: value.conversation, sender: value.sender,
      after: number(value.after), before: number(value.before), limit: boundedNumber(value.limit, 1, 100),
    })
  }))
  router.get('/api/local/v1/artifacts', route(async (request) => {
    const value = query(request, ['q', 'conversation', 'category', 'limit'])
    return service.artifacts({
      query: value.q, conversationId: value.conversation,
      category: value.category as 'all' | 'work' | 'document' | 'skill' | 'link' | undefined,
      limit: boundedNumber(value.limit, 1, 100),
    })
  }))
  router.get('/api/local/v1/documents/:id', route(async (request) => {
    const value = query(request, ['maxChars'])
    return service.readDocument({ assetId: parameter(request.params.id), maxCharacters: boundedNumber(value.maxChars, 1, 50_000) })
  }))
  router.get('/api/local/v1/messages/:uid/context', route(async (request) => {
    const value = query(request, ['radius'])
    return service.messageContext({ messageUid: parameter(request.params.uid), radius: boundedNumber(value.radius, 0, 20) })
  }))
  return router
}

export default createLocalApiRouter()
