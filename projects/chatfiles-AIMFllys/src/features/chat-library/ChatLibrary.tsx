import { useEffect, useMemo, useRef, useState } from 'react'
import type { AgentCitation, InsightSummary, WechatConversation, WechatConversationList } from '../../types'
import { wechatConversationListSchema } from '../../../shared/contracts/chatLibrary'
import { DEFAULT_ARCHIVE_TIME_ZONE } from '../../../shared/time/archiveTime'
import type { AIConfig } from '../../utils/aiConfig'
import { AIChatDock } from '../../components/ai/AIChatDock'
import { ArtifactWorkspace } from './ArtifactWorkspace'
import { ConversationSidebar } from './ConversationSidebar'
import type { ChatLibrarySelection } from './artifactModel'
import type { ChatRouteState } from '../chat-timeline/chatRouteState'
import { readJson } from '../../shared/api/client'
import { apiEndpoints } from '../../shared/api/endpoints'
import {
  parsePinnedConversationIds,
  serializePinnedConversationIds,
  togglePinnedConversation,
} from './pins'
import {
  parseSidebarCollapsed,
  serializeSidebarCollapsed,
  SIDEBAR_COLLAPSED_KEY,
} from './sidebarState'

const PIN_STORAGE_KEY = 'chatfiles.chat-library.pins'

type RoutedSelection = {
  routeConversationId?: string
  value: ChatLibrarySelection
}

export function ChatLibrary({
  summariesByConvId,
  aiConfig,
  onGotoSettings,
  routeConversationId,
  chatRouteState,
  onConversationChange,
  onChatRouteStateChange,
}: {
  summariesByConvId: Map<string, InsightSummary>
  aiConfig: AIConfig
  onGotoSettings: () => void
  routeConversationId?: string
  chatRouteState: ChatRouteState
  onConversationChange: (
    conversationId?: string,
    routePatch?: Partial<ChatRouteState>,
  ) => void
  onChatRouteStateChange: (patch: Partial<ChatRouteState>) => void
}) {
  const [conversationList, setConversationList] = useState<WechatConversationList>({
    runId: 'loading',
    timeZone: DEFAULT_ARCHIVE_TIME_ZONE,
    conversations: [],
    totals: { conversations: 0, messages: 0 },
  })
  const [loading, setLoading] = useState(true)
  const [routedSelection, setRoutedSelection] = useState<RoutedSelection>(() => ({
    routeConversationId,
    value: routeConversationId
      ? { kind: 'conversation', id: routeConversationId }
      : { kind: 'collection', id: 'outputs' },
  }))
  const selection = useMemo<ChatLibrarySelection>(() => (
    routedSelection.routeConversationId === routeConversationId
      ? routedSelection.value
      : routeConversationId
        ? { kind: 'conversation', id: routeConversationId }
        : { kind: 'collection', id: 'outputs' }
  ), [routeConversationId, routedSelection])
  const [pinnedIds, setPinnedIds] = useState<string[]>([])
  const [pinsReady, setPinsReady] = useState(false)
  const [mobilePane, setMobilePane] = useState<'sidebar' | 'workspace'>('sidebar')
  const [dockConversation, setDockConversation] = useState<WechatConversation>()
  const [citationTarget, setCitationTarget] = useState<{ citation: AgentCitation; nonce: number }>()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    parseSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY))
  ))
  const selectedControlRef = useRef<HTMLButtonElement>(null)
  const workspaceTitleRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    readJson(apiEndpoints.conversations, wechatConversationListSchema, { signal: controller.signal })
      .then((data) => {
        const validIds = new Set(data.conversations.map((conversation) => conversation.id))
        setConversationList(data)
        setPinnedIds(parsePinnedConversationIds(localStorage.getItem(PIN_STORAGE_KEY), validIds))
        setPinsReady(true)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setPinsReady(true)
        setLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (pinsReady) localStorage.setItem(PIN_STORAGE_KEY, serializePinnedConversationIds(pinnedIds))
  }, [pinnedIds, pinsReady])

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, serializeSidebarCollapsed(sidebarCollapsed))
  }, [sidebarCollapsed])

  const selectedConversation = useMemo(() => (
    selection.kind === 'conversation'
      ? conversationList.conversations.find((conversation) => conversation.id === selection.id)
      : undefined
  ), [conversationList.conversations, selection])

  const select = (next: ChatLibrarySelection) => {
    setRoutedSelection({
      routeConversationId: next.kind === 'conversation' ? next.id : undefined,
      value: next,
    })
    onConversationChange(next.kind === 'conversation' ? next.id : undefined)
    setDockConversation(undefined)
    setMobilePane('workspace')
    if (window.matchMedia('(max-width: 760px)').matches) {
      requestAnimationFrame(() => workspaceTitleRef.current?.focus())
    }
  }

  const showSidebar = () => {
    setMobilePane('sidebar')
    requestAnimationFrame(() => selectedControlRef.current?.focus())
  }

  const togglePin = (conversationId: string) => {
    setPinnedIds((current) => togglePinnedConversation(current, conversationId))
  }

  const openCitation = (citation: AgentCitation) => {
    if (citation.kind === 'message') {
      const conversationId = citation.conversationId ?? dockConversation?.id
      if (conversationId) {
        setRoutedSelection({
          routeConversationId: conversationId,
          value: { kind: 'conversation', id: conversationId },
        })
        onConversationChange(conversationId, { messageUid: citation.id })
        setMobilePane('workspace')
      }
    }
    setCitationTarget({ citation, nonce: Date.now() })
  }

  return (
    <section
      className="chat-library"
      data-mobile-pane={mobilePane}
      data-sidebar-collapsed={sidebarCollapsed}
    >
      <ConversationSidebar
        collapsed={sidebarCollapsed}
        conversations={conversationList.conversations}
        loading={loading}
        pinnedIds={pinnedIds}
        selectedControlRef={selectedControlRef}
        selection={selection}
        summariesByConvId={summariesByConvId}
        onSelect={select}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onTogglePin={togglePin}
      />
      <ArtifactWorkspace
        key={`${selection.kind}:${selection.id}:${citationTarget?.nonce ?? 0}`}
        selection={selection}
        conversation={selectedConversation}
        citationTarget={citationTarget}
        chatRouteState={chatRouteState}
        timeZone={conversationList.timeZone}
        pinned={selectedConversation ? pinnedIds.includes(selectedConversation.id) : false}
        titleRef={workspaceTitleRef}
        onBack={showSidebar}
        onTogglePin={() => selectedConversation && togglePin(selectedConversation.id)}
        onAnalyze={() => selectedConversation && setDockConversation(selectedConversation)}
        onChatRouteStateChange={onChatRouteStateChange}
      />
      {dockConversation && (
        <AIChatDock
          key={dockConversation.id}
          convId={dockConversation.id}
          convName={dockConversation.display}
          config={aiConfig}
          timeZone={conversationList.timeZone}
          onCitation={openCitation}
          onClose={() => setDockConversation(undefined)}
          onGotoSettings={onGotoSettings}
        />
      )}
    </section>
  )
}
