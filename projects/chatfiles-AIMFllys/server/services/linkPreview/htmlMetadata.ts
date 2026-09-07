export type ParsedHtmlMetadata = {
  title: string
  description: string
  siteName: string
  iconUrl: string
}

const namedEntities: Record<string, string> = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
}

function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (code[0] !== '#') return namedEntities[code.toLowerCase()] ?? entity
    const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10
    const digits = radix === 16 ? code.slice(2) : code.slice(1)
    const point = Number.parseInt(digits, radix)
    try {
      return Number.isSafeInteger(point) ? String.fromCodePoint(point) : entity
    } catch {
      return entity
    }
  })
}

function cleanText(value: string, maximum: number) {
  const cleaned = decodeEntities(value.replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim()
  const points = [...cleaned]
  return points.length <= maximum ? cleaned : points.slice(0, maximum).join('')
}

function attributes(tag: string) {
  const result = new Map<string, string>()
  const pattern = /([\w:-]+)\s*=\s*(["'])(.*?)\2/gsu
  for (const match of tag.matchAll(pattern)) result.set(match[1].toLowerCase(), match[3])
  return result
}

function metaValues(html: string) {
  const values = new Map<string, string>()
  for (const match of html.matchAll(/<meta\b[^>]*>/giu)) {
    const attrs = attributes(match[0])
    const key = (attrs.get('property') ?? attrs.get('name') ?? '').toLowerCase()
    const content = attrs.get('content') ?? ''
    if (key && content && !values.has(key)) values.set(key, content)
  }
  return values
}

function iconFromHtml(html: string, baseUrl: URL) {
  for (const match of html.matchAll(/<link\b[^>]*>/giu)) {
    const attrs = attributes(match[0])
    if (!/(?:^|\s)(?:shortcut\s+)?icon(?:\s|$)/iu.test(attrs.get('rel') ?? '')) continue
    try {
      const icon = new URL(attrs.get('href') ?? '', baseUrl)
      return ['http:', 'https:'].includes(icon.protocol) ? icon.href : ''
    } catch {
      return ''
    }
  }
  return ''
}

export function parseHtmlMetadata(html: string, baseUrl: URL): ParsedHtmlMetadata {
  const meta = metaValues(html)
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1] ?? ''
  return {
    title: cleanText(meta.get('og:title') ?? meta.get('twitter:title') ?? titleTag, 80),
    description: cleanText(
      meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description') ?? '',
      180,
    ),
    siteName: cleanText(meta.get('og:site_name') ?? '', 40),
    iconUrl: iconFromHtml(html, baseUrl),
  }
}
