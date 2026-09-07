import { useEffect, useState } from 'react'
import type { z } from 'zod/v4'
import { initialPageData, loadPageData, type PageDataState } from './pageData'

export function usePageData<Schema extends z.ZodType>(
  endpoint: string,
  schema: Schema,
  fallback: z.output<Schema>,
): PageDataState<z.output<Schema>> {
  const [resolved, setResolved] = useState(() => ({
    endpoint,
    schema,
    fallback,
    state: initialPageData(fallback),
  }))
  const state = resolved.endpoint === endpoint
    && resolved.schema === schema
    && resolved.fallback === fallback
    ? resolved.state
    : initialPageData(fallback)

  useEffect(() => {
    const controller = new AbortController()
    loadPageData(endpoint, schema, fallback, { signal: controller.signal })
      .then((next) => setResolved({ endpoint,schema,fallback,state: next }))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setResolved({
          endpoint,
          schema,
          fallback,
          state: { status: 'unavailable',data: fallback,code: 'request_failed' },
        })
      })
    return () => controller.abort()
  }, [endpoint, fallback, schema])

  return state
}
