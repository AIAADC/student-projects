import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import { MessageSquareText, Shapes } from 'lucide-react'
import { chatArtifactMetadataSchema, chatArtifactPageSchema } from '../../../shared/contracts/chatLibrary'
import type {
  ChatArtifactCounts,
  ChatArtifactListItem,
  ChatArtifactTab,
  AgentCitation,
  WechatConversation,
} from '../../types'
import { readJson } from '../../shared/api/client'
import { apiEndpoints } from '../../shared/api/endpoints'
import { useGridVirtualizer } from '../../hooks/useGridVirtualizer'
import { ArtifactCard } from './ArtifactCard'
import { ArtifactPreviewDialog } from './ArtifactPreviewDialog'
import { artifactRequestUrl, safeExternalUrl, type ChatLibrarySelection } from './artifactModel'
import { canLoadMoreArtifacts, isArtifactPageRequestCurrent } from './artifactPagination'
import { ArtifactWorkspaceHeader } from './ArtifactWorkspaceHeader'
import { mergeUnique } from './artifactWorkspaceModel'
import { ChatTimeline } from '../chat-timeline/ChatTimeline'
import type { ChatRouteState } from '../chat-timeline/chatRouteState'

const PAGE_SIZE = 120
const emptyCounts: ChatArtifactCounts = {
  all: 0,
  work: 0,
  document: 0,
  skill: 0,
  link: 0,
  chatText: 0,
}

export function ArtifactWorkspace({
  selection,
  conversation,
  pinned,
  onBack,
  onTogglePin,
  onAnalyze,
  titleRef,
  citationTarget,
  chatRouteState,
  onChatRouteStateChange,
  timeZone,
}: {
  selection: ChatLibrarySelection
  conversation?: WechatConversation
  pinned: boolean
  onBack: () => void
  onTogglePin: () => void
  onAnalyze: () => void
  titleRef: Ref<HTMLHeadingElement>
  citationTarget?: { citation: AgentCitation; nonce: number }
  chatRouteState: ChatRouteState
  onChatRouteStateChange: (patch: Partial<ChatRouteState>) => void
  timeZone: string
}) {
  const [tab, setTab] = useState<ChatArtifactTab>(() => (
    citationTarget?.citation.kind === 'message'
      || chatRouteState.messageUid
      || chatRouteState.sender
      || chatRouteState.day
      || chatRouteState.query
      ? 'chatText'
      : selection.kind === 'collection' && selection.id === 'library' ? 'work' : 'all'
  ))
  const query = chatRouteState.query
  const deferredQuery = useDeferredValue(query.trim())
  const [items, setItems] = useState<ChatArtifactListItem[]>([])
  const [counts, setCounts] = useState<ChatArtifactCounts>(emptyCounts)
  const [matchingTotal, setMatchingTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [loadMoreError, setLoadMoreError] = useState('')
  const [previewItem, setPreviewItem] = useState<ChatArtifactListItem>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const loadMoreControllerRef = useRef<AbortController | null>(null)
  const activeRequestScope = artifactRequestUrl({
    selection,
    tab,
    query: query.trim(),
    offset: 0,
    limit: PAGE_SIZE,
  })
  const activeRequestScopeRef = useRef(activeRequestScope)

  useLayoutEffect(() => {
    activeRequestScopeRef.current = activeRequestScope
    return () => loadMoreControllerRef.current?.abort()
  }, [activeRequestScope])

  useEffect(() => {
    if (tab === 'chatText') return
    const controller = new AbortController()
    const requestScope = artifactRequestUrl({
      selection,
      tab,
      query: deferredQuery,
      offset: 0,
      limit: PAGE_SIZE,
    })
    readJson(requestScope, chatArtifactPageSchema, { signal: controller.signal })
      .then((page) => {
        if (!isArtifactPageRequestCurrent(requestScope, activeRequestScopeRef.current)) return
        setItems(page.items)
        setCounts(page.counts)
        setMatchingTotal(page.matchingTotal)
        setLoadMoreError('')
        setLoadingMore(false)
        setLoading(false)
        scrollRef.current?.scrollTo({ top: 0 })
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        if (!isArtifactPageRequestCurrent(requestScope, activeRequestScopeRef.current)) return
        setItems([])
        setMatchingTotal(0)
        setLoadMoreError('')
        setLoadingMore(false)
        setError('素材索引暂时无法读取')
        setLoading(false)
      })
    return () => controller.abort()
  }, [deferredQuery, selection, tab])

  useEffect(() => {
    const target = citationTarget?.citation
    if (!target) return
    if (target.kind === 'message') return
    const controller = new AbortController()
    readJson(apiEndpoints.artifactMetadata(target.id), chatArtifactMetadataSchema, {
      signal: controller.signal,
    })
      .then(setPreviewItem)
      .catch(() => {})
    return () => controller.abort()
  }, [citationTarget])

  const loadMore = useCallback(() => {
    if (error || !canLoadMoreArtifacts({
      loading,
      loadingMore,
      loadMoreError,
      itemCount: items.length,
      matchingTotal,
    })) return

    const requestScope = activeRequestScope
    const controller = new AbortController()
    loadMoreControllerRef.current?.abort()
    loadMoreControllerRef.current = controller
    setLoadingMore(true)
    setLoadMoreError('')
    const url = artifactRequestUrl({
      selection,
      tab,
      query: deferredQuery,
      offset: items.length,
      limit: PAGE_SIZE,
    })
    readJson(url, chatArtifactPageSchema, { signal: controller.signal })
      .then((page) => {
        if (!isArtifactPageRequestCurrent(requestScope, activeRequestScopeRef.current)) return
        setItems((current) => mergeUnique(current, page.items))
        setMatchingTotal(page.matchingTotal)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        if (!isArtifactPageRequestCurrent(requestScope, activeRequestScopeRef.current)) return
        setLoadMoreError('无法继续载入素材')
      })
      .finally(() => {
        if (loadMoreControllerRef.current === controller) loadMoreControllerRef.current = null
        if (isArtifactPageRequestCurrent(requestScope, activeRequestScopeRef.current)) {
          setLoadingMore(false)
        }
      })
  }, [activeRequestScope, deferredQuery, error, items.length, loadMoreError, loading, loadingMore, matchingTotal, selection, tab])

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const onScroll = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 640) loadMore()
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [loadMore])

  const virtual = useGridVirtualizer(scrollRef, items.length, {
    minCol: tab === 'chatText' ? 280 : 220,
    rowH: 278,
    gap: 14,
    padX: 20,
    padY: 20,
    overscan: 3,
  })
  const visibleItems = useMemo(() => items.slice(virtual.start, virtual.end), [items, virtual.end, virtual.start])
  const openItem = (item: ChatArtifactListItem) => {
    if (item.itemType === 'artifact' && item.category === 'link' && item.url) {
      const externalUrl = safeExternalUrl(item.url)
      if (externalUrl) {
        window.open(externalUrl, '_blank', 'noopener,noreferrer')
        return
      }
    }
    setPreviewItem(item)
  }

  return (
    <section className="artifact-workspace">
      <ArtifactWorkspaceHeader
        conversation={conversation}
        counts={counts}
        onAnalyze={onAnalyze}
        onBack={onBack}
        onKeyboardTabChange={(next) => {
          setLoading(true)
          setError('')
          setTab(next)
        }}
        onQueryChange={(next) => {
          setLoading(true)
          setLoadingMore(false)
          setError('')
          setLoadMoreError('')
          onChatRouteStateChange({ query: next })
        }}
        onTabChange={(next) => {
          setLoading(true)
          setLoadingMore(false)
          setError('')
          setLoadMoreError('')
          setTab(next)
        }}
        onTogglePin={onTogglePin}
        pinned={pinned}
        query={query}
        selection={selection}
        tab={tab}
        titleRef={titleRef}
      />

      <div
        aria-labelledby={`artifact-tab-${tab}`}
        className={tab === 'chatText' ? 'artifact-scroll is-timeline' : 'artifact-scroll'}
        id="artifact-tab-panel"
        ref={scrollRef}
        role="tabpanel"
      >
        {tab === 'chatText' ? (
          selection.kind === 'conversation' ? (
            <ChatTimeline
              conversationId={selection.id}
              onRouteStateChange={onChatRouteStateChange}
              routeState={{ ...chatRouteState, query: deferredQuery }}
            />
          ) : (
            <div className="artifact-empty"><MessageSquareText size={30} /><p>选择一个会话后查看聊天时间轴</p></div>
          )
        ) : loading ? (
          <div className="artifact-empty"><span className="library-loader" /><p>正在载入...</p></div>
        ) : error && items.length === 0 ? (
          <div className="artifact-empty"><p>{error}</p></div>
        ) : items.length === 0 ? (
          <div className="artifact-empty"><Shapes size={34} /><p>当前分类没有匹配内容</p></div>
        ) : (
          <div className="artifact-virtual-space" style={{ height: virtual.totalHeight }}>
            <div
              className="artifact-grid-window"
              style={{
                gridTemplateColumns: `repeat(${virtual.cols}, minmax(0, 1fr))`,
                transform: `translateY(${virtual.translateY}px)`,
              }}
            >
              {visibleItems.map((item) => (
                <ArtifactCard item={item} key={item.id} onOpen={openItem} timeZone={timeZone} />
              ))}
            </div>
          </div>
        )}
        {loadingMore && <div className="artifact-loading-more">正在载入更多...</div>}
        {!loadingMore && loadMoreError && (
          <button className="artifact-loading-more" onClick={loadMore} type="button">
            载入失败，点击重试
          </button>
        )}
      </div>

      {previewItem && (
        <ArtifactPreviewDialog item={previewItem} onClose={() => setPreviewItem(undefined)} timeZone={timeZone} />
      )}
    </section>
  )
}
