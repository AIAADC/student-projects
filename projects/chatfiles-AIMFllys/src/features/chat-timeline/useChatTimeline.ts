import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  timelineDayPageSchema,
  timelinePageSchema,
  timelineParticipantPageSchema,
  type TimelineDay,
  type TimelineMessage,
  type TimelinePage,
  type TimelineParticipant,
} from '../../../shared/contracts/chatTimeline'
import { DEFAULT_ARCHIVE_TIME_ZONE } from '../../../shared/time/archiveTime'
import { apiEndpoints } from '../../shared/api/endpoints'
import { readJson } from '../../shared/api/client'
import { mergeTimelineMessages, trimTimelinePages, type TimelinePageWindow } from './timelineModel'

const PAGE_SIZE = 120
const DAY_PAGE_SIZE = 90
const MAX_PAGES = 5

type LoadedWindow = TimelinePageWindow & { pageInfo: TimelinePage['pageInfo'] }
type TimelineOptions = { query: string; sender: string; focusMessageUid?: string }

function pageWindow(page: TimelinePage): LoadedWindow {
  const first = page.messages[0]?.message_uid ?? 'empty'
  const last = page.messages.at(-1)?.message_uid ?? 'empty'
  return { id: `${first}:${last}`, messages: page.messages, pageInfo: page.pageInfo }
}

function aborted(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError'
}

export function useChatTimeline(
  conversationId: string,
  { query, sender, focusMessageUid }: TimelineOptions,
) {
  const [pages, setPages] = useState<LoadedWindow[]>([])
  const [participants, setParticipants] = useState<TimelineParticipant[]>([])
  const [days, setDays] = useState<TimelineDay[]>([])
  const [dayCursor, setDayCursor] = useState<string | null>(null)
  const [hasMoreDays, setHasMoreDays] = useState(false)
  const [timeZone, setTimeZone] = useState(DEFAULT_ARCHIVE_TIME_ZONE)
  const [resolvedMessageScope, setResolvedMessageScope] = useState('')
  const [resolvedParticipantScope, setResolvedParticipantScope] = useState('')
  const [resolvedDayScope, setResolvedDayScope] = useState('')
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  const [loadingMoreDaysScope, setLoadingMoreDaysScope] = useState('')
  const [errorState, setErrorState] = useState<{ scope: string; message: string }>()
  const [revision, setRevision] = useState(0)
  const pagingControllers = useRef(new Set<AbortController>())
  const messageScope = `${conversationId}\n${query.trim()}\n${sender}\n${focusMessageUid ?? ''}`
  const participantScope = `${conversationId}\n${query.trim()}`
  const dayScope = `${participantScope}\n${sender}`
  const loadingMoreDays = loadingMoreDaysScope === dayScope
  const messageScopeRef = useRef(messageScope)
  const dayScopeRef = useRef(dayScope)

  useEffect(() => { messageScopeRef.current = messageScope }, [messageScope])
  useEffect(() => { dayScopeRef.current = dayScope }, [dayScope])

  useEffect(() => {
    const controller = new AbortController()
    for (const pending of pagingControllers.current) pending.abort()
    pagingControllers.current.clear()
    readJson(apiEndpoints.timeline(conversationId, {
      limit: PAGE_SIZE,
      query,
      sender,
      ...(focusMessageUid ? { aroundUid: focusMessageUid } : {}),
    }), timelinePageSchema, { signal: controller.signal })
      .then((page) => {
        setPages([pageWindow(page)])
        setTimeZone(page.timeZone)
        setErrorState(undefined)
        setResolvedMessageScope(messageScope)
        setRevision((value) => value + 1)
      })
      .catch((reason: unknown) => {
        if (aborted(reason)) return
        setPages([])
        setErrorState({ scope: messageScope, message: '聊天时间轴暂时无法读取' })
        setResolvedMessageScope(messageScope)
      })
    return () => controller.abort()
  }, [conversationId, focusMessageUid, messageScope, query, sender])

  useEffect(() => {
    const controller = new AbortController()
    readJson(
      apiEndpoints.timelineParticipants(conversationId, query),
      timelineParticipantPageSchema,
      { signal: controller.signal },
    ).then((page) => {
      setParticipants(page.participants)
      setTimeZone(page.timeZone)
      setResolvedParticipantScope(participantScope)
    }).catch((reason: unknown) => {
      if (aborted(reason)) return
      setParticipants([])
      setResolvedParticipantScope(participantScope)
    })
    return () => controller.abort()
  }, [conversationId, participantScope, query])

  useEffect(() => {
    const controller = new AbortController()
    readJson(apiEndpoints.timelineDays(conversationId, {
      limit: DAY_PAGE_SIZE, query, sender,
    }), timelineDayPageSchema, { signal: controller.signal })
      .then((page) => {
        setDays(page.days)
        setDayCursor(page.pageInfo.nextCursor)
        setHasMoreDays(page.pageInfo.hasMore)
        setTimeZone(page.timeZone)
        setResolvedDayScope(dayScope)
      })
      .catch((reason: unknown) => {
        if (aborted(reason)) return
        setDays([])
        setDayCursor(null)
        setHasMoreDays(false)
        setResolvedDayScope(dayScope)
      })
    return () => controller.abort()
  }, [conversationId, dayScope, query, sender])

  const active = resolvedMessageScope === messageScope
  const activePages = useMemo(() => active ? pages : [], [active, pages])

  const loadDirection = useCallback(async (kind: 'before' | 'after') => {
    if (!active || (kind === 'before' ? loadingOlder : loadingNewer)) return false
    const edge = kind === 'before' ? activePages[0] : activePages.at(-1)
    const cursor = kind === 'before' ? edge?.pageInfo.olderCursor : edge?.pageInfo.newerCursor
    const available = kind === 'before' ? edge?.pageInfo.hasOlder : edge?.pageInfo.hasNewer
    if (!cursor || !available) return false
    const requestedScope = messageScopeRef.current
    const controller = new AbortController()
    pagingControllers.current.add(controller)
    if (kind === 'before') setLoadingOlder(true)
    else setLoadingNewer(true)
    try {
      const page = await readJson(apiEndpoints.timeline(conversationId, {
        limit: PAGE_SIZE, query, sender, [kind]: cursor,
      }), timelinePageSchema, { signal: controller.signal })
      if (requestedScope !== messageScopeRef.current) return false
      setPages((current) => {
        const next = kind === 'before' ? [pageWindow(page), ...current] : [...current, pageWindow(page)]
        const anchor = page.messages[Math.floor(page.messages.length / 2)]?.message_uid
        return trimTimelinePages(next, MAX_PAGES, anchor)
      })
      setTimeZone(page.timeZone)
      setRevision((value) => value + 1)
      return true
    } catch (reason) {
      if (!aborted(reason)) setErrorState({ scope: requestedScope, message: '无法继续载入时间轴' })
      return false
    } finally {
      pagingControllers.current.delete(controller)
      if (kind === 'before') setLoadingOlder(false)
      else setLoadingNewer(false)
    }
  }, [active, activePages, conversationId, loadingNewer, loadingOlder, query, sender])

  const loadMoreDays = useCallback(async () => {
    if (resolvedDayScope !== dayScope || !hasMoreDays || !dayCursor || loadingMoreDays) return false
    const requestedScope = dayScopeRef.current
    setLoadingMoreDaysScope(requestedScope)
    try {
      const page = await readJson(apiEndpoints.timelineDays(conversationId, {
        limit: DAY_PAGE_SIZE, before: dayCursor, query, sender,
      }), timelineDayPageSchema)
      if (requestedScope !== dayScopeRef.current) return false
      setDays((current) => {
        const known = new Set(current.map((day) => day.date))
        return [...current, ...page.days.filter((day) => !known.has(day.date))]
      })
      setDayCursor(page.pageInfo.nextCursor)
      setHasMoreDays(page.pageInfo.hasMore)
      return true
    } catch {
      return false
    } finally {
      if (requestedScope === dayScopeRef.current) setLoadingMoreDaysScope('')
    }
  }, [conversationId, dayCursor, dayScope, hasMoreDays, loadingMoreDays, query, resolvedDayScope, sender])

  const messages = useMemo(() => (
    activePages.reduce<TimelineMessage[]>((all, page) => mergeTimelineMessages(all, page.messages), [])
  ), [activePages])

  return {
    messages,
    participants: resolvedParticipantScope === participantScope ? participants : [],
    days: resolvedDayScope === dayScope ? days : [],
    timeZone,
    sender,
    loading: !active,
    loadingOlder,
    loadingNewer,
    loadingMoreDays,
    hasMoreDays,
    error: errorState?.scope === messageScope ? errorState.message : '',
    focusUid: active ? focusMessageUid : undefined,
    revision,
    hasOlder: Boolean(activePages[0]?.pageInfo.hasOlder),
    hasNewer: Boolean(activePages.at(-1)?.pageInfo.hasNewer),
    loadOlder: () => loadDirection('before'),
    loadNewer: () => loadDirection('after'),
    loadMoreDays,
  }
}
