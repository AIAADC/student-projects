import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { Response } from 'express'
import mime from 'mime'
import type {
  ChatArtifactAvailability,
  ChatArtifactCapability,
  ChatArtifactMetadata,
  ChatArtifactTab,
  LinkPreview,
} from '../../shared/contracts/chat.js'
import { imageThumb, videoPoster } from '../utils/thumbs.js'
import { openCatalogArtifactDatabase, openCatalogWechatDatabase } from '../data/productDatabases.js'
import { readActiveProductSet } from '../data/catalogReader.js'
import {
  createArtifactAccountRootProvider,
  type ArtifactSourceAsset,
  type ArtifactSourceResolution,
} from '../wechat/artifactSourceResolver.js'
import { createLinkPreviewService } from '../services/linkPreview/linkPreviewService.js'

export { isCanonicalWechatDatabase as canonicalWechatDatabase } from '../domain/chat/canonicalWechatDatabase.js'

export type DatabaseLease = {
  db: DatabaseSync | null
  bundleRoot?: string | null
  release: () => void
}

export type WechatRouterDependencies = {
  openWechatDatabase: () => DatabaseLease
  openArtifactDatabase: () => DatabaseLease
  openProductDatabases: () => { wechat: DatabaseLease;artifacts: DatabaseLease }
  accountRootProvider: (assetDb: DatabaseSync) => string | null
  imageThumbnail: (target: string, width: number) => string
  videoThumbnail: (target: string, width: number) => string
  resolveLinkPreview: (artifactId: string, url: string) => Promise<LinkPreview>
}

const tabs = new Set<ChatArtifactTab>(['all', 'work', 'document', 'skill', 'link', 'chatText'])
const collections = new Set(['outputs', 'library'] as const)

function defaultWechatLease(projectRoot: string): DatabaseLease {
  const opened = openCatalogWechatDatabase(projectRoot)
  return { db: opened.db, release: () => opened.db?.close() }
}

function defaultArtifactLease(projectRoot: string): DatabaseLease {
  const opened = openCatalogArtifactDatabase(projectRoot)
  return { db: opened.db,bundleRoot: opened.bundleRoot,release: () => opened.db?.close() }
}

function defaultProductLeases(projectRoot: string) {
  const active = readActiveProductSet(projectRoot)
  const readActive = () => active
  const wechat = openCatalogWechatDatabase(projectRoot, readActive)
  const artifacts = openCatalogArtifactDatabase(projectRoot, readActive)
  return {
    wechat: { db: wechat.db,release: () => wechat.db?.close() },
    artifacts: {
      db: artifacts.db,bundleRoot: artifacts.bundleRoot,release: () => artifacts.db?.close(),
    },
  }
}

export function defaultDependencies(projectRoot: string): WechatRouterDependencies {
  const linkPreviews = createLinkPreviewService({ cacheDir: path.join(projectRoot, 'work', 'link-preview-cache') })
  return {
    openWechatDatabase: () => defaultWechatLease(projectRoot),
    openArtifactDatabase: () => defaultArtifactLease(projectRoot),
    openProductDatabases: () => defaultProductLeases(projectRoot),
    accountRootProvider: createArtifactAccountRootProvider({ projectRoot }),
    imageThumbnail: imageThumb,
    videoThumbnail: videoPoster,
    resolveLinkPreview: (artifactId, url) => linkPreviews.resolve(artifactId, url),
  }
}

export function sendError(
  response: Response,
  status: number,
  code: string,
  state?: ChatArtifactAvailability,
) {
  return response.status(status).json({
    error: 'Request failed',
    code,
    ...(state ? { state } : {}),
  })
}

function singleQueryValue(value: unknown, fallback: string) {
  return value === undefined ? fallback : typeof value === 'string' ? value : null
}

export function parseCollectionQuery(query: Record<string, unknown>) {
  const tabValue = singleQueryValue(query.tab, 'all')
  const collectionValue = singleQueryValue(query.collection, 'outputs')
  const queryValue = singleQueryValue(query.q, '')
  const limitValue = singleQueryValue(query.limit, '60')
  const offsetValue = singleQueryValue(query.offset, '0')
  if (
    tabValue === null
    || collectionValue === null
    || queryValue === null
    || limitValue === null
    || offsetValue === null
    || !tabs.has(tabValue as ChatArtifactTab)
    || !collections.has(collectionValue as 'outputs' | 'library')
    || queryValue.length > 200
    || !/^[1-9][0-9]*$/u.test(limitValue)
    || !/^(?:0|[1-9][0-9]*)$/u.test(offsetValue)
  ) return null
  const limit = Number(limitValue)
  const offset = Number(offsetValue)
  if (!Number.isSafeInteger(limit) || limit > 200 || !Number.isSafeInteger(offset)) return null
  return {
    collection: collectionValue as 'outputs' | 'library',
    tab: tabValue as ChatArtifactTab,
    query: queryValue.trim(),
    limit,
    offset,
  }
}

export function validConversationId(id: string) {
  return id.length > 0 && id.length <= 512 && !id.includes('\u0000')
}

export function publicMetadata(
  asset: ArtifactSourceAsset,
  availability: ChatArtifactAvailability,
  capabilities: ChatArtifactCapability,
): ChatArtifactMetadata {
  return {
    id: asset.id,
    itemType: 'artifact',
    conversationId: asset.conversationId,
    category: asset.category,
    kind: asset.kind,
    name: asset.name,
    preview: asset.preview,
    url: asset.url,
    createdAt: asset.createdAt,
    senderName: asset.senderName,
    size: asset.size,
    availability,
    association: { status: asset.associationStatus, evidence: asset.associationEvidence },
    source: { presence: asset.sourcePresence },
    materialization: { status: asset.materialization },
    capability: { previewStatus: asset.previewStatus },
    metadataUrl: capabilities.metadata,
    capabilities,
  }
}

export function assetResultError(response: Response, result: ArtifactSourceResolution) {
  if (result.status === 'malformed') return sendError(response, 400, 'invalid_asset_id')
  if (result.status === 'unknown') return sendError(response, 404, 'not_found')
  if (result.status === 'configuration_unavailable') return sendError(response, 503, 'configuration_unavailable')
  if (result.status === 'unsupported') return sendError(response, 415, 'operation_unsupported', result.state)
  if (result.status === 'unavailable') return sendError(response, 409, 'source_unavailable', result.state)
  return null
}

export function setPrivateFileHeaders(response: Response) {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('Cache-Control', 'private, no-store')
}

export function clearFileRepresentationHeaders(response: Response) {
  for (const header of [
    'Content-Type', 'Content-Length', 'Content-Disposition', 'Content-Security-Policy',
    'Last-Modified', 'ETag', 'Accept-Ranges',
  ]) response.removeHeader(header)
}

export function byteRangeSatisfiable(range: string | undefined, target: string) {
  if (range === undefined) return { ok: true, size: null }
  const size = fs.statSync(target).size
  const match = range.match(/^bytes=([0-9]*)-([0-9]*)$/u)
  if (!match || (!match[1] && !match[2]) || size === 0) return { ok: false, size }
  if (!match[1]) {
    const suffix = Number(match[2])
    return { ok: Number.isSafeInteger(suffix) && suffix > 0, size }
  }
  const start = Number(match[1])
  const end = match[2] ? Number(match[2]) : size - 1
  const ok = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start < size && end >= start
  return { ok, size }
}

function safeFilename(value: string) {
  const sanitized = value.replaceAll('\r', '').replaceAll('\n', '').replaceAll('\u0000', '')
  const basename = path.win32.basename(path.posix.basename(sanitized))
  return basename || 'download'
}

function rfc5987(value: string) {
  return [...Buffer.from(value, 'utf8')]
    .map((byte) => (
      (byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x41 && byte <= 0x5a)
      || (byte >= 0x61 && byte <= 0x7a)
      || [0x21, 0x23, 0x24, 0x26, 0x2b, 0x2d, 0x2e, 0x5e, 0x5f, 0x60, 0x7c, 0x7e].includes(byte)
        ? String.fromCharCode(byte)
        : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    ))
    .join('')
}

function contentDisposition(disposition: 'inline' | 'attachment', filename: string) {
  const safe = safeFilename(filename)
  const fallback = safe.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_')
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${rfc5987(safe)}`
}

function inlineMime(mimeType: string) {
  return mimeType === 'application/pdf'
    || mimeType === 'text/html'
    || mimeType === 'text/plain'
    || mimeType === 'text/markdown'
    || (/^image\//u.test(mimeType) && mimeType !== 'image/svg+xml')
    || /^audio\//u.test(mimeType)
    || /^video\//u.test(mimeType)
}

export function sendPrivateFile(response: Response, file: { target: string; name: string }) {
  const mimeType = mime.getType(file.target) ?? mime.getType(file.name) ?? 'application/octet-stream'
  const disposition = inlineMime(mimeType) ? 'inline' : 'attachment'
  setPrivateFileHeaders(response)
  const contentType = mimeType === 'text/html' || mimeType === 'text/plain' || mimeType === 'text/markdown'
    ? `${mimeType}; charset=utf-8`
    : mimeType
  response.setHeader('Content-Type', contentType)
  response.setHeader('Content-Disposition', contentDisposition(disposition, file.name))
  if (mimeType === 'text/html') {
    response.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; media-src data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'")
  }
  response.sendFile(file.target, (error) => {
    if (!error) return
    const status = (error as Error & { status?: number }).status === 416 ? 416 : 409
    if (response.headersSent) {
      if (!response.writableEnded) response.end()
      return
    }
    clearFileRepresentationHeaders(response)
    sendError(response, status, status === 416 ? 'range_not_satisfiable' : 'source_unavailable')
  })
}

export function sendResolvedFile(response: Response, result: Extract<ArtifactSourceResolution, { status: 'available' }>) {
  return sendPrivateFile(response, { target: result.target, name: result.asset.name })
}

export function parseThumbnailWidth(value: unknown) {
  const raw = singleQueryValue(value, '360')
  if (raw === null || !/^[1-9][0-9]*$/u.test(raw)) return null
  const width = Number(raw)
  if (!Number.isSafeInteger(width) || width < 96 || width > 512) return null
  return Math.max(96, Math.min(512, Math.round(width / 16) * 16))
}
