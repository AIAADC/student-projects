import type { z } from 'zod/v4'

export type ApiClientErrorCode =
  | 'request_failed'
  | 'invalid_content_type'
  | 'invalid_json'
  | 'invalid_response'

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiClientErrorCode,
    public readonly status?: number,
    public readonly serverCode?: string,
  ) {
    super(code)
    this.name = 'ApiClientError'
  }
}

export type ReadOptions = {
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function request(options: ReadOptions, url: string) {
  return (options.fetchImpl ?? fetch)(url, { signal: options.signal })
}

async function successfulResponse(url: string, options: ReadOptions) {
  const response = await request(options, url)
  if (!response.ok) throw new ApiClientError('request_failed', response.status)
  return response
}

function serverErrorCode(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const code = (value as Record<string, unknown>).code
  return typeof code === 'string' ? code : undefined
}

export async function readJson<Schema extends z.ZodType>(
  url: string,
  schema: Schema,
  options: ReadOptions = {},
): Promise<z.output<Schema>> {
  const response = await request(options, url)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.includes('application/json')) {
    throw new ApiClientError('invalid_content_type', response.status)
  }
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new ApiClientError('invalid_json', response.status)
  }
  if (!response.ok) {
    throw new ApiClientError('request_failed', response.status, serverErrorCode(value))
  }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiClientError('invalid_response', response.status)
  return parsed.data
}

export async function readText(url: string, options: ReadOptions = {}) {
  const response = await successfulResponse(url, options)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  const textual = contentType.startsWith('text/')
    || contentType.includes('application/json')
    || contentType.includes('+json')
    || contentType.includes('application/xml')
    || contentType.includes('+xml')
    || contentType.includes('javascript')
  if (!textual) {
    throw new ApiClientError('invalid_content_type', response.status)
  }
  return response.text()
}

async function binaryResponse(url: string, options: ReadOptions) {
  const response = await successfulResponse(url, options)
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType || contentType.includes('application/json') || contentType.startsWith('text/html')) {
    throw new ApiClientError('invalid_content_type', response.status)
  }
  return response
}

export async function readBlob(url: string, options: ReadOptions = {}) {
  return (await binaryResponse(url, options)).blob()
}

export async function readArrayBuffer(url: string, options: ReadOptions = {}) {
  return (await binaryResponse(url, options)).arrayBuffer()
}
