import fs from 'node:fs'
import path from 'node:path'
import type { LinkPreview } from '../../../shared/contracts/chat.js'
import { parseHtmlMetadata } from './htmlMetadata.js'
import { validatePublicUrl, type HostResolver } from './urlPolicy.js'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type CacheRecord = { sourceUrl: string; expiresAt: number; value: LinkPreview }
type ServiceOptions = {
  cacheDir: string
  fetchImpl?: FetchLike
  resolveHost?: HostResolver
  now?: () => number
  maxBytes?: number
  timeoutMs?: number
}

const SUCCESS_TTL = 24 * 60 * 60 * 1000
const FAILURE_TTL = 30 * 60 * 1000

function safeUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url : null
  } catch {
    return null
  }
}

function fallback(value: string, now: number): LinkPreview {
  const url = safeUrl(value)
  return {
    status: 'fallback',
    url: url?.href ?? '',
    domain: url?.hostname ?? '',
    title: '',
    description: '',
    siteName: '',
    iconUrl: '',
    updatedAt: new Date(now).toISOString(),
  }
}

function readCache(filePath: string, sourceUrl: string, now: number) {
  try {
    const record = JSON.parse(fs.readFileSync(filePath, 'utf8')) as CacheRecord
    return record.sourceUrl === sourceUrl && record.expiresAt > now ? record.value : null
  } catch {
    return null
  }
}

function writeCache(filePath: string, sourceUrl: string, value: LinkPreview, now: number) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const expiresAt = now + (value.status === 'ready' ? SUCCESS_TTL : FAILURE_TTL)
    const temporary = `${filePath}.${process.pid}.tmp`
    fs.writeFileSync(temporary, JSON.stringify({ sourceUrl, expiresAt, value } satisfies CacheRecord), 'utf8')
    fs.renameSync(temporary, filePath)
  } catch {
    // Cache failures must never break browsing.
  }
}

async function limitedText(response: Response, maximum: number) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (size < maximum) {
    const { done, value } = await reader.read()
    if (done) break
    const remaining = maximum - size
    chunks.push(value.length > remaining ? value.slice(0, remaining) : value)
    size += Math.min(value.length, remaining)
    if (value.length > remaining) {
      await reader.cancel()
      break
    }
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder().decode(bytes)
}

export function createLinkPreviewService(options: ServiceOptions) {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const maximum = options.maxBytes ?? 256 * 1024
  const timeoutMs = options.timeoutMs ?? 5000
  return {
    async resolve(artifactId: string, sourceUrl: string): Promise<LinkPreview> {
      const cachePath = path.join(options.cacheDir, `${artifactId}.json`)
      const cached = readCache(cachePath, sourceUrl, now())
      if (cached) return cached
      const fail = () => fallback(sourceUrl, now())
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      let current = sourceUrl
      let result = fail()
      try {
        for (let redirects = 0; redirects <= 3; redirects += 1) {
          const url = await validatePublicUrl(current, options.resolveHost)
          if (!url) break
          const response = await fetchImpl(url, {
            redirect: 'manual',
            signal: controller.signal,
            headers: {
              accept: 'text/html,application/xhtml+xml;q=0.9',
              'user-agent': 'ChatFiles-LinkPreview/1.0',
            },
          })
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location')
            if (!location || redirects === 3) break
            current = new URL(location, url).href
            continue
          }
          const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
          if (!response.ok || !contentType.includes('text/html')) break
          const metadata = parseHtmlMetadata(await limitedText(response, maximum), url)
          if (!metadata.title && !metadata.description && !metadata.siteName) break
          result = {
            status: 'ready',
            url: url.href,
            domain: url.hostname,
            ...metadata,
            updatedAt: new Date(now()).toISOString(),
          }
          break
        }
      } catch {
        result = fail()
      } finally {
        clearTimeout(timeout)
      }
      writeCache(cachePath, sourceUrl, result, now())
      return result
    },
  }
}
