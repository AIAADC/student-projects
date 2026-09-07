import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { insightsResponseSchema } from '../../shared/contracts/uiData'
import type { InsightSummary } from '../types'
import ChatBoard from '../boards/Chat'
import { pathForTab } from '../app/navigation'
import {
  chatRouteUrl,
  parseChatRouteState,
  patchChatRouteLocation,
  selectChatConversation,
  type ChatRouteLocation,
} from '../features/chat-timeline/chatRouteState'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { loadAIConfig } from '../utils/aiConfig'
import { emptyInsights } from '../utils/constants'
import '../styles/chat-library.css'
import '../styles/chat-timeline.css'
import '../styles/link-preview.css'
import '../styles/ai-dock.css'
import '../styles/ai-agent.css'

export default function ChatPage() {
  const navigate = useNavigate()
  const { conversationId } = useParams<{ conversationId: string }>()
  const [searchParams] = useSearchParams()
  const insights = usePageData(apiEndpoints.insights, insightsResponseSchema, emptyInsights)
  const [aiConfig] = useState(loadAIConfig)
  const routeState = useMemo(() => parseChatRouteState(searchParams), [searchParams])
  const renderedLocation = useMemo<ChatRouteLocation>(
    () => ({ conversationId, state: routeState }),
    [conversationId, routeState],
  )
  const locationRef = useRef(renderedLocation)

  useLayoutEffect(() => {
    locationRef.current = renderedLocation
  }, [renderedLocation])

  const summariesByConvId = useMemo(() => {
    const summaries = new Map<string, InsightSummary>()
    for (const summary of insights.data.summaries) summaries.set(summary.convId, summary)
    return summaries
  }, [insights.data.summaries])

  const changeConversation = (
    nextConversationId?: string,
    routePatch: Partial<typeof routeState> = {},
  ) => {
    const next = patchChatRouteLocation(selectChatConversation(nextConversationId), routePatch)
    const nextUrl = chatRouteUrl(next)
    if (nextUrl === chatRouteUrl(locationRef.current)) return
    locationRef.current = next
    navigate(nextUrl)
  }

  const changeRouteState = (patch: Partial<typeof routeState>) => {
    const next = patchChatRouteLocation(locationRef.current, patch)
    locationRef.current = next
    navigate(chatRouteUrl(next), { replace: Object.hasOwn(patch, 'query') })
  }

  return (
    <PageDataNotice blocking={false} states={[insights]}>
      <ChatBoard
        aiConfig={aiConfig}
        chatRouteState={routeState}
        onChatRouteStateChange={changeRouteState}
        onConversationChange={changeConversation}
        onGotoSettings={() => navigate(pathForTab('ai'))}
        routeConversationId={conversationId}
        summariesByConvId={summariesByConvId}
      />
    </PageDataNotice>
  )
}
