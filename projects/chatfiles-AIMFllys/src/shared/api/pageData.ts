import type { z } from 'zod/v4'
import { ApiClientError, readJson } from './client'

export type PageDataState<Value> =
  | { status: 'loading';data: Value }
  | { status: 'ready';data: Value }
  | { status: 'stale';data: Value }
  | { status: 'unavailable';data: Value;code: string }

export function initialPageData<T>(fallback: T): PageDataState<T> {
  return { status: 'loading',data: fallback }
}

export async function loadPageData<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
  fallback: z.output<Schema>,
  options: { fetchImpl?: typeof fetch;signal?: AbortSignal } = {},
): Promise<PageDataState<z.output<Schema>>> {
  try {
    const data = await readJson(endpoint, schema, options)
    const stale = data && typeof data === 'object' && 'state' in data && data.state === 'stale'
    return { status: stale ? 'stale' : 'ready',data }
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') throw reason
    const code = reason instanceof ApiClientError
      ? reason.serverCode ?? reason.code
      : 'request_failed'
    return { status: 'unavailable',data: fallback,code }
  }
}
