import type { Router } from 'express'
import { archiveDateSchema } from '../../shared/contracts/primitives.js'
import {
  WechatQueryError,
  type WechatQueryService,
} from '../application/chat/wechatQueryService.js'
import { decodeTimelineCursor } from '../services/chatTimeline.js'
import {
  sendError,
  validConversationId,
} from './wechatRouteHelpers.js'

function single(value: unknown, fallback = '') {
  return value === undefined ? fallback : typeof value === 'string' ? value : null
}

function withinCodePointLimit(value: string, maximum: number) {
  return !value.includes('\u0000') && [...value].length <= maximum
}

function parseTimelineQuery(query: Record<string, unknown>) {
  const limitValue = single(query.limit, '120')
  const before = single(query.before)
  const after = single(query.after)
  const around = single(query.around)
  const aroundUid = single(query.aroundUid)
  const sender = single(query.sender)
  const text = single(query.q)
  if ([limitValue, before, after, around, aroundUid, sender, text].some((value) => value === null)) return null
  if (!/^[1-9][0-9]*$/u.test(limitValue!)) return null
  const limit = Number(limitValue)
  if (!Number.isSafeInteger(limit) || limit > 240) return null
  if (!withinCodePointLimit(sender!, 512) || !withinCodePointLimit(text!, 200)) return null
  if (!withinCodePointLimit(aroundUid!, 512)) return null
  const cursors = [before, after, around, aroundUid].filter(Boolean) as string[]
  const encodedCursors = [before, after, around].filter(Boolean) as string[]
  if (cursors.length > 1 || encodedCursors.some((cursor) => !decodeTimelineCursor(cursor))) return null
  return {
    limit,
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(around ? { around } : {}),
    ...(aroundUid ? { aroundUid } : {}),
    ...(sender ? { sender } : {}),
    ...(text!.trim() ? { query: text!.trim() } : {}),
  }
}

function parseParticipantQuery(query: Record<string, unknown>) {
  const text = single(query.q)
  if (text === null || !withinCodePointLimit(text, 200)
    || Object.keys(query).some((key) => key !== 'q')) return null
  return text.trim() ? { query: text.trim() } : {}
}

function parseDayQuery(query: Record<string, unknown>) {
  const limitValue = single(query.limit, '90')
  const before = single(query.before)
  const sender = single(query.sender)
  const text = single(query.q)
  if ([limitValue, before, sender, text].some((value) => value === null)) return null
  if (!/^[1-9][0-9]*$/u.test(limitValue!)) return null
  const limit = Number(limitValue)
  if (!Number.isSafeInteger(limit) || limit > 366) return null
  if (!withinCodePointLimit(sender!, 512) || !withinCodePointLimit(text!, 200)) return null
  if (before && !archiveDateSchema.safeParse(before).success) return null
  if (Object.keys(query).some((key) => !['limit', 'before', 'sender', 'q'].includes(key))) return null
  return {
    limit,
    ...(before ? { before } : {}),
    ...(sender ? { sender } : {}),
    ...(text!.trim() ? { query: text!.trim() } : {}),
  }
}

function sendQueryError(response: Parameters<typeof sendError>[0], error: unknown) {
  if (error instanceof WechatQueryError && error.code === 'not_found') {
    return sendError(response, 404, 'not_found')
  }
  return sendError(response, 503, 'database_unavailable')
}

export function registerWechatTimelineRoutes(router: Router, queries: WechatQueryService) {
  router.get([
    '/api/wechat/conversation/:id/timeline',
    '/api/v1/chat/conversations/:id/timeline',
  ], (request, response) => {
    const conversationId = single(request.params.id)
    if (!conversationId || !validConversationId(conversationId)) return sendError(response, 400, 'invalid_conversation_id')
    const input = parseTimelineQuery(request.query as Record<string, unknown>)
    if (!input) return sendError(response, 400, 'invalid_query')
    try {
      return response.json(queries.timeline({ conversationId, ...input }))
    } catch (error) {
      return sendQueryError(response, error)
    }
  })

  router.get('/api/v1/chat/conversations/:id/timeline/participants', (request, response) => {
    const conversationId = single(request.params.id)
    if (!conversationId || !validConversationId(conversationId)) return sendError(response, 400, 'invalid_conversation_id')
    const input = parseParticipantQuery(request.query as Record<string, unknown>)
    if (!input) return sendError(response, 400, 'invalid_query')
    try {
      return response.json(queries.timelineParticipants({ conversationId, ...input }))
    } catch (error) {
      return sendQueryError(response, error)
    }
  })

  router.get('/api/v1/chat/conversations/:id/timeline/days', (request, response) => {
    const conversationId = single(request.params.id)
    if (!conversationId || !validConversationId(conversationId)) return sendError(response, 400, 'invalid_conversation_id')
    const input = parseDayQuery(request.query as Record<string, unknown>)
    if (!input) return sendError(response, 400, 'invalid_query')
    try {
      return response.json(queries.timelineDays({ conversationId, ...input }))
    } catch (error) {
      return sendQueryError(response, error)
    }
  })
}
