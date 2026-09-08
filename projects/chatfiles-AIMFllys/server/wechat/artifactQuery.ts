import type { DatabaseSync } from 'node:sqlite'

import type {
  ChatArtifactCounts,
  ChatArtifactItem,
  ChatArtifactPage,
  ChatArtifactTab,
  ChatTextItem,
} from '../../shared/contracts/chat.js'
import { inspectMessageStorage, stableMessageUid } from './legacyMessageIdentity.js'
import { inspectArtifactStorage, type ArtifactStorageShape } from './artifactStorageShape.js'
import { artifactAvailabilityFor } from './artifactAvailability.js'
import { readWechatBundleIdentity } from '../domain/chat/wechatBundleIdentity.js'

export type ArtifactQueryInput = {
  collection?: 'outputs' | 'library'
  conversationId?: string
  tab: ChatArtifactTab
  query: string
  limit: number
  offset: number
}

type CountRow = { category: string; count: number }

type ArtifactRow = {
  asset_id: string
  conv_id: string | null
  category: ChatArtifactItem['category']
  kind: string
  name: string
  preview: string
  url: string | null
  source_size: number | null
  created_at: number
  sender_name: string
  materialization: string
  preview_status: string
  association_status: ChatArtifactItem['association']['status']
  association_evidence: string
  source_presence: ChatArtifactItem['source']['presence']
}

type ChatTextRow = {
  message_uid: string | null
  conv_id: string
  sequence: number
  time: number
  legacy_rowid: number
  sender_name: string
  text: string
}

function escapedLike(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function scopeClause(conversationId: string | undefined) {
  return conversationId === undefined ? '' : ' AND conv_id=?'
}

function scopeParams(conversationId: string | undefined) {
  return conversationId === undefined ? [] : [conversationId]
}

function readCounts(
  assetDb: DatabaseSync,
  wechatDb: DatabaseSync,
  input: Pick<ArtifactQueryInput, 'collection' | 'conversationId'>,
  shape: ArtifactStorageShape,
) {
  const readyMaterialization = shape.version === 2 ? "materialization='ready'" : "materialization='exported'"
  const libraryOnly = input.collection === 'library'
    ? ` AND ${readyMaterialization} AND preview_status='ready'`
    : ''
  const scoped = scopeClause(input.conversationId)
  const params = scopeParams(input.conversationId)
  const rows = assetDb.prepare(`
    SELECT category, count(*) AS count
    FROM artifacts
    WHERE category IN ('work', 'document', 'skill', 'link')
      AND ${shape.verifiedPredicate}${libraryOnly}${scoped}
    GROUP BY category
  `).all(...params) as CountRow[]
  const counts: ChatArtifactCounts = { all: 0, work: 0, document: 0, skill: 0, link: 0, chatText: 0 }
  for (const row of rows) {
    if (row.category === 'work' || row.category === 'document' || row.category === 'skill' || row.category === 'link') {
      counts[row.category] = Number(row.count)
      counts.all += Number(row.count)
    }
  }
  if (!libraryOnly) {
    const textRow = wechatDb.prepare(`
      SELECT count(*) AS count FROM messages WHERE type=1${scoped}
    `).get(...params) as { count: number } | undefined
    counts.chatText = Number(textRow?.count ?? 0)
  }
  return counts
}

function artifactWhere(input: ArtifactQueryInput, shape: ArtifactStorageShape) {
  const clauses = ["category IN ('work', 'document', 'skill', 'link')", shape.verifiedPredicate]
  const params: Array<string | number> = []
  if (input.collection === 'library') {
    clauses.push(
      shape.version === 2 ? "materialization='ready'" : "materialization='exported'",
      "preview_status='ready'",
    )
  }
  if (input.tab !== 'all' && input.tab !== 'chatText') {
    clauses.push('category=?')
    params.push(input.tab)
  }
  if (input.conversationId !== undefined) {
    clauses.push('conv_id=?')
    params.push(input.conversationId)
  }
  if (input.query) {
    clauses.push("(name LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\' OR text LIKE ? ESCAPE '\\' OR url LIKE ? ESCAPE '\\')")
    const pattern = escapedLike(input.query)
    params.push(pattern, pattern, pattern, pattern)
  }
  return { sql: clauses.join(' AND '), params }
}

function queryArtifactItems(assetDb: DatabaseSync, input: ArtifactQueryInput, shape: ArtifactStorageShape) {
  const where = artifactWhere(input, shape)
  const matching = assetDb.prepare(`SELECT count(*) AS count FROM artifacts WHERE ${where.sql}`)
    .get(...where.params) as { count: number } | undefined
  const rows = assetDb.prepare(`
    SELECT asset_id, conv_id, category, kind, name, preview, url, source_size, created_at,
           sender_name, materialization, preview_status,
           ${shape.associationStatus} AS association_status,
           ${shape.associationEvidence} AS association_evidence,
           ${shape.sourcePresence} AS source_presence
    FROM artifacts
    WHERE ${where.sql}
    ORDER BY created_at DESC, asset_id ASC
    LIMIT ? OFFSET ?
  `).all(...where.params, input.limit, input.offset) as ArtifactRow[]
  const items: ChatArtifactItem[] = rows.map((row) => ({
    id: row.asset_id,
    itemType: 'artifact',
    conversationId: row.conv_id,
    category: row.category,
    kind: row.kind,
    name: row.name,
    preview: row.preview,
    url: row.url,
    createdAt: Number(row.created_at),
    senderName: row.sender_name,
    size: row.source_size === null ? null : Number(row.source_size),
    availability: artifactAvailabilityFor(row.materialization, row.preview_status, shape.version),
    association: { status: row.association_status, evidence: row.association_evidence },
    source: { presence: row.source_presence },
    materialization: { status: row.materialization },
    capability: { previewStatus: row.preview_status },
    metadataUrl: `/api/v1/chat/artifacts/${row.asset_id}/metadata`,
  }))
  return { matchingTotal: Number(matching?.count ?? 0), items }
}

function queryChatTextItems(wechatDb: DatabaseSync, input: ArtifactQueryInput) {
  const storage = inspectMessageStorage(wechatDb)
  const canonical = storage.canonical
  const clauses = ['type=1']
  const params: string[] = []
  if (input.conversationId !== undefined) {
    clauses.push('conv_id=?')
    params.push(input.conversationId)
  }
  if (input.query) {
    clauses.push("(text LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\')")
    const pattern = escapedLike(input.query)
    params.push(pattern, pattern)
  }
  const where = clauses.join(' AND ')
  const matching = wechatDb.prepare(`SELECT count(*) AS count FROM messages WHERE ${where}`)
    .get(...params) as { count: number } | undefined
  const timeProjection = canonical ? 'occurred_at_epoch_s AS time' : 'time'
  const sequenceProjection = canonical ? 'canonical_seq AS sequence' : 'seq AS sequence'
  const messageUidProjection = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  const order = canonical
    ? 'occurred_at_epoch_s DESC,conv_id,canonical_seq DESC'
    : storage.messageUidGuaranteed
      ? 'time DESC,message_uid ASC,rowid'
      : 'time DESC,seq DESC,rowid DESC'
  const rows = wechatDb.prepare(`
    SELECT ${messageUidProjection}, conv_id, ${sequenceProjection}, ${timeProjection},
           rowid AS legacy_rowid, sender_name, text
    FROM messages
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).all(...params, input.limit, input.offset) as ChatTextRow[]
  const items: ChatTextItem[] = rows.map((row) => {
    const messageUid = stableMessageUid(row, storage.hasMessageUid)
    return {
      id: `chat:${messageUid}`,
      itemType: 'chatText',
      conversationId: row.conv_id,
      messageUid,
      createdAt: Number(row.time),
      senderName: row.sender_name,
      content: row.text,
    }
  })
  return { matchingTotal: Number(matching?.count ?? 0), items }
}

export function queryArtifacts(
  assetDb: DatabaseSync,
  wechatDb: DatabaseSync,
  input: ArtifactQueryInput,
): ChatArtifactPage {
  const shape = inspectArtifactStorage(assetDb)
  const counts = readCounts(assetDb, wechatDb, input, shape)
  const result = input.tab === 'chatText'
    ? input.collection === 'library'
      ? { matchingTotal: 0, items: [] }
      : queryChatTextItems(wechatDb, input)
    : queryArtifactItems(assetDb, input, shape)
  return {
    ...readWechatBundleIdentity(wechatDb),
    tab: input.tab,
    counts,
    total: counts[input.tab],
    matchingTotal: result.matchingTotal,
    offset: input.offset,
    limit: input.limit,
    items: result.items,
  }
}
