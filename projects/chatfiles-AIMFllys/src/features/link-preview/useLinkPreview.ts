import { useEffect, useRef, useState } from 'react'
import { linkPreviewSchema } from '../../../shared/contracts/linkPreview'
import type { LinkPreview } from '../../types'
import { readJson } from '../../shared/api/client'
import { apiEndpoints } from '../../shared/api/endpoints'

export type LinkPreviewLoadStatus = 'idle' | 'loading' | 'ready' | 'fallback'

export function useLinkPreview(artifactId: string, enabled: boolean) {
  const ref = useRef<HTMLSpanElement>(null)
  const [entered, setEntered] = useState(() => typeof IntersectionObserver === 'undefined')
  const [data, setData] = useState<LinkPreview | null>(null)
  const [resultStatus, setResultStatus] = useState<'ready' | 'fallback' | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || !enabled || entered) return
    if (typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setEntered(true)
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, entered])

  useEffect(() => {
    if (!enabled || !entered) return
    const controller = new AbortController()
    readJson(apiEndpoints.artifactLinkPreview(artifactId), linkPreviewSchema, {
      signal: controller.signal,
    })
      .then((body) => {
        setData(body)
        setResultStatus(body.status)
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setResultStatus('fallback')
      })
    return () => controller.abort()
  }, [artifactId, enabled, entered])

  const status: LinkPreviewLoadStatus = !enabled || !entered
    ? 'idle'
    : resultStatus ?? 'loading'
  return { data, ref, status }
}
