import type { DatabaseSync } from 'node:sqlite'

import type { LinkPreview } from '../../shared/contracts/chat.js'
import type {
  OperationName,
  ParsedOperationInput,
} from '../../shared/contracts/operations.js'
import { encodeTimelineAnchor, queryTimeline } from '../services/chatTimeline.js'
import type { DocumentReadResult } from '../services/documents/documentTypes.js'
import type { HybridSearchResult } from '../services/search/hybridSearch.js'
import { queryArtifacts } from '../wechat/artifactQuery.js'
import {
  inspectMessageStorage,
  resolveMessageAnchor,
  stableMessageUid,
  type MessageStorageShape,
  type ResolvedMessageAnchor,
} from '../wechat/legacyMessageIdentity.js'

export type OperationHandlerDependencies = {
  wechatDb: DatabaseSync
  artifactDb: DatabaseSync
  searchMessages: (input: {
    query: string
    conversationId?: string
    sender?: string
    after?: number
    before?: number
    limit: number
  }) => Promise<HybridSearchResult>
  readDocument: (assetId: string, maxCharacters: number) => Promise<DocumentReadResult>
  resolveLinkPreview: (assetId: string, url: string) => Promise<LinkPreview>
}

export class OperationHandlerError extends Error {
  constructor(public readonly code: 'not_found' | 'unavailable' | 'operation_failed') {
    super(code)
    this.name = 'OperationHandlerError'
  }
}

function requireDependencies<Key extends keyof OperationHandlerDependencies>(
  dependencies: Partial<OperationHandlerDependencies>, keys: readonly Key[],
): Pick<OperationHandlerDependencies, Key> {
  if (keys.some((key) => dependencies[key] === undefined)) throw new OperationHandlerError('unavailable')
  return dependencies as Pick<OperationHandlerDependencies, Key>
}

function citation(kind: '消息' | '文件', id: string) {
  return `[${kind}:${id}]`
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function boundedText(value: string, maximum = 4_000) {
  const points = [...value]
  return points.length <= maximum ? value : points.slice(0, maximum).join('')
}

function escapedLike(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function listConversations(
  args: ParsedOperationInput<'list_conversations'>,
  deps: Pick<OperationHandlerDependencies, 'wechatDb'>,
) {
  const query = args.query ?? ''
  const where = query ? "WHERE display LIKE ? ESCAPE '\\'" : ''
  const rows = deps.wechatDb.prepare(`
    SELECT id,display,is_group,msg_count,text_count,first_time,last_time
    FROM conversations ${where} ORDER BY last_time DESC,id LIMIT ?
  `).all(...(query ? [escapedLike(query)] : []), args.limit) as Array<Record<string, unknown>>
  return { conversations: rows.map((row) => ({
    id: String(row.id), display: String(row.display), isGroup: Boolean(row.is_group),
    messageCount: Number(row.msg_count), textCount: Number(row.text_count),
    firstTime: Number(row.first_time), lastTime: Number(row.last_time),
  })) }
}

async function searchMessages(
  args: ParsedOperationInput<'search_messages'>,
  deps: Pick<OperationHandlerDependencies, 'searchMessages'>,
) {
  const result = await deps.searchMessages({
    query: args.query, limit: args.limit,
    ...(args.conversationId ? { conversationId: args.conversationId } : {}),
    ...(args.sender ? { sender: args.sender } : {}),
    ...(args.after !== undefined ? { after: args.after } : {}),
    ...(args.before !== undefined ? { before: args.before } : {}),
  })
  const hits = result.hits.slice(0, args.limit).map((hit) => ({
    conversationId: hit.conversationId, firstMessageUid: hit.firstMessageUid,
    lastMessageUid: hit.lastMessageUid, firstSequence: hit.firstSequence,
    lastSequence: hit.lastSequence, startTime: hit.startTime, endTime: hit.endTime,
    senders: hit.senderIds, text: boundedText(hit.text), citation: citation('消息', hit.firstMessageUid),
  }))
  return { mode: result.mode, reason: result.reason, hits, citations: unique(hits.map((hit) => hit.citation)) }
}

type MessageRow = {
  conv_id: string
  message_uid: string
  canonical_seq?: number
  time: number
  sender: string
  sender_name: string
  type_label: string
  text: string
}

type StoredMessageRow = Omit<MessageRow, 'message_uid'> & {
  legacy_rowid: number
  message_uid: string | null
  sequence: number
}

function messageProjection(storage: MessageStorageShape) {
  const messageUid = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  const sequence = storage.canonical ? 'canonical_seq' : 'seq'
  const time = storage.canonical ? 'occurred_at_epoch_s' : 'time'
  const canonicalSequence = storage.canonical ? ',canonical_seq' : ''
  return `conv_id,${messageUid},${sequence} AS sequence,${time} AS time${canonicalSequence},
    rowid AS legacy_rowid,sender,sender_name,type_label,text`
}

function materializeMessage(row: StoredMessageRow, storage: MessageStorageShape): MessageRow {
  const { legacy_rowid, message_uid, sequence, ...message } = row
  return {
    ...message,
    message_uid: stableMessageUid({
      conv_id: row.conv_id, legacy_rowid: Number(legacy_rowid), message_uid,
      sequence: Number(sequence), time: Number(row.time),
    }, storage.hasMessageUid),
  }
}

function contextRows(
  db: DatabaseSync,
  storage: MessageStorageShape,
  anchor: ResolvedMessageAnchor,
  direction: 'before' | 'after',
  radius: number,
) {
  const operator = direction === 'before' ? '<' : '>'
  const order = direction === 'before' ? 'DESC' : 'ASC'
  let comparison: string
  let values: Array<string | number>
  if (storage.canonical) {
    comparison = `canonical_seq${operator}?`
    values = [anchor.sequence]
  } else if (storage.messageUidGuaranteed) {
    comparison = `(time${operator}? OR (time=? AND
      (message_uid${operator}? OR (message_uid=? AND rowid${operator}?))))`
    values = [anchor.time, anchor.time, anchor.message_uid, anchor.message_uid, anchor.legacy_rowid]
  } else {
    comparison = `(time${operator}? OR (time=? AND
      (seq${operator}? OR (seq=? AND rowid${operator}?))))`
    values = [anchor.time, anchor.time, anchor.sequence, anchor.sequence, anchor.legacy_rowid]
  }
  const identityOrder = storage.canonical
    ? `canonical_seq ${order}`
    : storage.messageUidGuaranteed
      ? `time ${order},message_uid ${order},rowid ${order}`
      : `time ${order},seq ${order},rowid ${order}`
  const rows = db.prepare(`SELECT ${messageProjection(storage)} FROM messages
    WHERE conv_id=? AND ${comparison} ORDER BY ${identityOrder} LIMIT ?`)
    .all(anchor.conv_id, ...values, radius) as StoredMessageRow[]
  const messages = rows.map((row) => materializeMessage(row, storage))
  return direction === 'before' ? messages.reverse() : messages
}

function publicMessage(row: MessageRow) {
  return {
    conversationId: row.conv_id, messageUid: row.message_uid, time: Number(row.time),
    ...(row.canonical_seq === undefined ? {} : { canonicalSequence: Number(row.canonical_seq) }),
    sender: row.sender, senderName: row.sender_name, typeLabel: row.type_label,
    text: boundedText(row.text ?? ''), citation: citation('消息', row.message_uid),
  }
}

function messageContext(
  args: ParsedOperationInput<'get_message_context'>,
  deps: Pick<OperationHandlerDependencies, 'wechatDb'>,
) {
  const storage = inspectMessageStorage(deps.wechatDb)
  const anchor = resolveMessageAnchor(deps.wechatDb, args.messageUid, storage)
  if (!anchor) throw new OperationHandlerError('not_found')
  const storedTarget = deps.wechatDb.prepare(`SELECT ${messageProjection(storage)} FROM messages WHERE rowid=?`)
    .get(anchor.legacy_rowid) as StoredMessageRow | undefined
  if (!storedTarget) throw new OperationHandlerError('not_found')
  const target = materializeMessage(storedTarget, storage)
  if (target.message_uid !== args.messageUid) throw new OperationHandlerError('not_found')
  const messages = [
    ...contextRows(deps.wechatDb, storage, anchor, 'before', args.radius),
    target,
    ...contextRows(deps.wechatDb, storage, anchor, 'after', args.radius),
  ].map(publicMessage)
  return { conversationId: target.conv_id, messages, citations: messages.map((message) => message.citation) }
}

function searchArtifacts(
  args: ParsedOperationInput<'search_artifacts'>,
  deps: Pick<OperationHandlerDependencies, 'artifactDb' | 'wechatDb'>,
) {
  const page = queryArtifacts(deps.artifactDb, deps.wechatDb, {
    collection: 'outputs', tab: args.category, query: args.query ?? '', limit: args.limit, offset: 0,
    ...(args.conversationId ? { conversationId: args.conversationId } : {}),
  })
  const artifacts = page.items.flatMap((item) => item.itemType === 'artifact' ? [{
    assetId: item.id, conversationId: item.conversationId, category: item.category,
    name: item.name, preview: item.preview, senderName: item.senderName,
    createdAt: item.createdAt, availability: item.availability, citation: citation('文件', item.id),
  }] : [])
  return { artifacts, citations: artifacts.map((item) => item.citation) }
}

function timelineSlice(
  args: ParsedOperationInput<'get_timeline_slice'>,
  deps: Pick<OperationHandlerDependencies, 'wechatDb'>,
) {
  let around: string | undefined
  if (args.aroundMessageUid) {
    around = encodeTimelineAnchor(deps.wechatDb, args.conversationId, args.aroundMessageUid) ?? undefined
    if (!around) throw new OperationHandlerError('not_found')
  }
  const page = queryTimeline(deps.wechatDb, {
    conversationId: args.conversationId, limit: args.limit,
    ...(around ? { around } : {}), ...(args.sender ? { sender: args.sender } : {}),
    ...(args.query ? { query: args.query } : {}),
  })
  const messages = page.messages.map((message) => publicMessage({ ...message, conv_id: args.conversationId }))
  return { conversationId: args.conversationId, messages, pageInfo: page.pageInfo,
    citations: messages.map((message) => message.citation) }
}

async function linkPreview(
  args: ParsedOperationInput<'get_link_preview'>,
  deps: Pick<OperationHandlerDependencies, 'artifactDb' | 'resolveLinkPreview'>,
) {
  const row = deps.artifactDb.prepare('SELECT category,url FROM artifacts WHERE asset_id=?')
    .get(args.assetId) as { category: string; url: string | null } | undefined
  if (!row || row.category !== 'link' || !row.url) throw new OperationHandlerError('not_found')
  const preview = await deps.resolveLinkPreview(args.assetId, row.url)
  return {
    status: preview.status, url: preview.url, domain: preview.domain, title: preview.title,
    description: preview.description, siteName: preview.siteName, updatedAt: preview.updatedAt,
    citation: citation('文件', args.assetId),
  }
}

export function createOperationHandlers(deps: Partial<OperationHandlerDependencies>) {
  return {
    async execute(name: OperationName, input: unknown): Promise<unknown> {
      try {
        if (name === 'list_conversations') return listConversations(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['wechatDb']))
        if (name === 'search_messages') return await searchMessages(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['searchMessages']))
        if (name === 'get_message_context') return messageContext(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['wechatDb']))
        if (name === 'search_artifacts') return searchArtifacts(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['artifactDb', 'wechatDb']))
        if (name === 'read_document') {
          const args = input as ParsedOperationInput<typeof name>
          return await requireDependencies(deps, ['readDocument']).readDocument(args.assetId, args.maxCharacters)
        }
        if (name === 'get_timeline_slice') return timelineSlice(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['wechatDb']))
        if (name === 'get_link_preview') return await linkPreview(input as ParsedOperationInput<typeof name>, requireDependencies(deps, ['artifactDb', 'resolveLinkPreview']))
        throw new OperationHandlerError('operation_failed')
      } catch (error) {
        if (error instanceof OperationHandlerError) throw error
        throw new OperationHandlerError('operation_failed')
      }
    },
  }
}
