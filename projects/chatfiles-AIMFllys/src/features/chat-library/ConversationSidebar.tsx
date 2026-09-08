import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import { Archive, FolderHeart, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Search } from 'lucide-react'
import type { InsightSummary, WechatConversation } from '../../types'
import { fmtDate } from '../../utils/format'
import { useFixedListVirtualizer } from '../../hooks/useFixedListVirtualizer'
import { firstCodePoint, type ChatLibrarySelection } from './artifactModel'
import { orderConversationsPinnedFirst } from './pins'

type Props = {
  collapsed: boolean
  conversations: WechatConversation[]
  loading: boolean
  pinnedIds: string[]
  selectedControlRef: Ref<HTMLButtonElement>
  selection: ChatLibrarySelection
  summariesByConvId: Map<string, InsightSummary>
  onSelect: (selection: ChatLibrarySelection) => void
  onToggleCollapsed: () => void
  onTogglePin: (conversationId: string) => void
}

const collections = [
  { id: 'library' as const, label: '我的素材库', detail: '作品与可浏览创作', icon: FolderHeart },
  { id: 'outputs' as const, label: '全部产出', detail: '跨会话汇总', icon: Archive },
]

export function ConversationSidebar({
  collapsed,
  conversations,
  loading,
  pinnedIds,
  selectedControlRef,
  selection,
  summariesByConvId,
  onSelect,
  onToggleCollapsed,
  onTogglePin,
}: Props) {
  const [query, setQuery] = useState('')
  const [focusedConversationId, setFocusedConversationId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationSectionRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const focusedRowRef = useRef<HTMLDivElement | null>(null)
  const ordered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('zh-CN')
    const matches = term
      ? conversations.filter((conversation) => {
          const insight = summariesByConvId.get(conversation.id)?.summary ?? ''
          return `${conversation.display}\n${conversation.summary ?? ''}\n${insight}`
            .toLocaleLowerCase('zh-CN')
            .includes(term)
        })
      : conversations
    return orderConversationsPinnedFirst(matches, pinnedIds)
  }, [conversations, pinnedIds, query, summariesByConvId])

  const retainedIndices = useMemo(() => {
    const retained: number[] = []
    if (selection.kind === 'conversation') retained.push(ordered.findIndex((item) => item.id === selection.id))
    if (focusedConversationId) retained.push(ordered.findIndex((item) => item.id === focusedConversationId))
    return retained
  }, [focusedConversationId, ordered, selection])
  const virtualWindow = useFixedListVirtualizer(scrollRef, listRef, ordered.length, {
    itemHeight: 68,
    gap: 2,
    overscan: 6,
    retainedIndices,
  })
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds])

  useEffect(() => {
    if (focusedConversationId) focusedRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [focusedConversationId, ordered])

  const updateQuery = (value: string) => {
    const scroller = scrollRef.current
    const section = conversationSectionRef.current
    if (scroller && section) {
      scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    }
    setQuery(value)
  }

  return (
    <aside className="conversation-sidebar" aria-label="聊天资料库导航" data-collapsed={collapsed}>
      <header className="conversation-sidebar-header">
        <div className="conversation-sidebar-title-row">
          <strong>聊天资料库</strong>
          <button
            aria-label={collapsed ? '展开资料库' : '收起资料库'}
            className="sidebar-collapse-button"
            onClick={onToggleCollapsed}
            title={collapsed ? '展开资料库' : '收起资料库'}
            type="button"
          >
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <label className="library-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="搜索会话"
            maxLength={120}
            onChange={(event) => updateQuery(event.target.value)}
            placeholder="搜索会话"
            value={query}
          />
        </label>
      </header>

      <div className="conversation-scroll" ref={scrollRef}>
        <section className="sidebar-section" aria-labelledby="collection-heading">
          <h2 id="collection-heading">资料库</h2>
          {collections.map((collection) => {
            const Icon = collection.icon
            const selected = selection.kind === 'collection' && selection.id === collection.id
            return (
              <button
                aria-current={selected ? 'page' : undefined}
                className={`collection-row${selected ? ' is-selected' : ''}`}
                key={collection.id}
                onClick={() => onSelect({ kind: 'collection', id: collection.id })}
                ref={selected ? selectedControlRef : undefined}
                type="button"
              >
                <span className={`collection-icon collection-icon-${collection.id}`}><Icon size={19} /></span>
                <span><strong>{collection.label}</strong><small>{collection.detail}</small></span>
              </button>
            )
          })}
        </section>

        <section
          aria-labelledby="conversation-heading"
          className="sidebar-section"
          ref={conversationSectionRef}
        >
          <h2 id="conversation-heading">会话 <span>{ordered.length.toLocaleString()}</span></h2>
          {loading && <p className="sidebar-status">正在载入...</p>}
          {!loading && ordered.length === 0 && <p className="sidebar-status">没有匹配的会话</p>}
          <div
            aria-labelledby="conversation-heading"
            className="conversation-list"
            ref={listRef}
            role="list"
            style={{ height: virtualWindow.totalHeight }}
          >
            {virtualWindow.indices.map((index) => {
              const conversation = ordered[index]
              if (!conversation) return null
              const isPinned = pinned.has(conversation.id)
              const selected = selection.kind === 'conversation' && selection.id === conversation.id
              const subtitle = summariesByConvId.get(conversation.id)?.summary || conversation.summary
              const insideWindow = index >= virtualWindow.start && index < virtualWindow.end
              return (
                <div
                  aria-posinset={index + 1}
                  aria-setsize={ordered.length}
                  className={`conversation-row${selected ? ' is-selected' : ''}`}
                  key={conversation.id}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      focusedRowRef.current = null
                      setFocusedConversationId((current) => current === conversation.id ? null : current)
                    }
                  }}
                  onFocusCapture={(event) => {
                    focusedRowRef.current = event.currentTarget
                    setFocusedConversationId(conversation.id)
                  }}
                  role="listitem"
                  style={{ transform: `translateY(${index * 70}px)` }}
                >
                  <button
                    aria-current={selected ? 'page' : undefined}
                    className="conversation-main"
                    onClick={() => onSelect({ kind: 'conversation', id: conversation.id })}
                    ref={selected ? selectedControlRef : undefined}
                    tabIndex={insideWindow ? undefined : -1}
                    type="button"
                  >
                    <span className={`conversation-avatar ${conversation.is_group ? 'is-group' : 'is-private'}`}>
                      {firstCodePoint(conversation.display, conversation.is_group ? '群' : '聊')}
                    </span>
                    <span className="conversation-copy">
                      <span className="conversation-line">
                        <strong>{conversation.display}</strong>
                        <time>{fmtDate(conversation.last_time)}</time>
                      </span>
                      <small>{subtitle || `${conversation.msg_count.toLocaleString()} 条消息`}</small>
                    </span>
                  </button>
                  <button
                    aria-label={isPinned ? `取消置顶 ${conversation.display}` : `置顶 ${conversation.display}`}
                    aria-pressed={isPinned}
                    className="pin-button"
                    onClick={() => onTogglePin(conversation.id)}
                    tabIndex={insideWindow ? undefined : -1}
                    title={isPinned ? '取消置顶' : '置顶'}
                    type="button"
                  >
                    {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </aside>
  )
}
