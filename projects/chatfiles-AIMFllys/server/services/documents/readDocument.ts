import fs from 'node:fs'
import path from 'node:path'
import type { ArtifactSourceResolver } from '../../wechat/artifactSourceResolver.js'
import { extractDocxText } from './docxText.js'
import type { DocumentReadErrorCode, DocumentReadInput, DocumentReadResult } from './documentTypes.js'

const DEFAULT_CHARACTERS = 24_000
const MAX_CHARACTERS = 200_000
const MAX_DOCX_BYTES = 32 * 1024 * 1024
const textExtensions = new Set([
  '.txt', '.md', '.markdown', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss',
  '.py', '.java', '.c', '.cc', '.cpp', '.h', '.hpp', '.go', '.rs', '.sh', '.ps1',
  '.yaml', '.yml', '.toml', '.ini', '.xml', '.csv', '.sql',
])

export class DocumentReadError extends Error {
  constructor(public readonly code: DocumentReadErrorCode) {
    super(code)
    this.name = 'DocumentReadError'
  }
}

function readPrefix(target: string, maximumBytes: number) {
  const handle = fs.openSync(target, 'r')
  try {
    const sourceSize = fs.fstatSync(handle).size
    const size = Math.min(sourceSize, maximumBytes)
    const buffer = Buffer.allocUnsafe(size)
    const bytesRead = fs.readSync(handle, buffer, 0, size, 0)
    return { buffer: buffer.subarray(0, bytesRead), truncated: bytesRead < sourceSize }
  } finally {
    fs.closeSync(handle)
  }
}

function decodeUtf8(buffer: Buffer, allowIncompleteSuffix: boolean) {
  const trims = allowIncompleteSuffix ? [0, 1, 2, 3] : [0]
  for (const trim of trims) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, buffer.length - trim))
    } catch {
      // A bounded prefix may end within one UTF-8 code point; internal corruption still fails.
    }
  }
  throw new DocumentReadError('invalid_document')
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity
    const hex = code[1]?.toLowerCase() === 'x'
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10)
    try { return Number.isSafeInteger(point) ? String.fromCodePoint(point) : entity } catch { return entity }
  })
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html
    .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/giu, '\n')
    .replace(/<[^>]*>/gu, ' '))
    .replace(/[\t ]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
}

function formatText(extension: string, preview: string, raw: string) {
  if (extension === '.html' || extension === '.htm' || preview === 'html') return htmlToText(raw)
  if (extension === '.json' || preview === 'json') {
    try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
  }
  return raw
}

function supported(extension: string, preview: string) {
  return textExtensions.has(extension)
    || extension === '.html'
    || extension === '.htm'
    || extension === '.docx'
    || ['text', 'markdown', 'code', 'json', 'html', 'docx'].includes(preview)
}

function truncate(value: string, maximum: number) {
  const points = [...value]
  return { text: points.slice(0, maximum).join(''), truncated: points.length > maximum }
}

export async function readDocument(
  resolver: ArtifactSourceResolver,
  input: DocumentReadInput,
): Promise<DocumentReadResult> {
  const resolution = resolver.resolve(input.assetId, 'content')
  if (resolution.status === 'malformed') throw new DocumentReadError('invalid_asset_id')
  if (resolution.status === 'unknown') throw new DocumentReadError('document_not_found')
  if (resolution.status !== 'available') throw new DocumentReadError('document_unavailable')
  const extension = path.extname(resolution.asset.name).toLowerCase()
  if (!supported(extension, resolution.asset.preview)) throw new DocumentReadError('unsupported_document')
  const maximum = Math.max(1, Math.min(Math.round(input.maxCharacters ?? DEFAULT_CHARACTERS), MAX_CHARACTERS))
  let fullText: string
  let sourceTruncated = false
  if (extension === '.docx' || resolution.asset.preview === 'docx') {
    if ((resolution.asset.size ?? MAX_DOCX_BYTES + 1) > MAX_DOCX_BYTES) throw new DocumentReadError('document_too_large')
    try { fullText = await extractDocxText(fs.readFileSync(resolution.target)) } catch { throw new DocumentReadError('invalid_document') }
  } else {
    const prefix = readPrefix(resolution.target, maximum * 4 + 65_536)
    sourceTruncated = prefix.truncated
    fullText = formatText(extension, resolution.asset.preview, decodeUtf8(prefix.buffer, prefix.truncated))
  }
  const bounded = truncate(fullText, maximum)
  return {
    assetId: resolution.asset.id,
    title: resolution.asset.name,
    text: bounded.text,
    truncated: bounded.truncated || sourceTruncated,
    citation: `[文件:${resolution.asset.id}]`,
  }
}
