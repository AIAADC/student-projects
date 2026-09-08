import type { InsightSummary } from '../types'
import type { AIConfig } from '../utils/aiConfig'
import { ChatLibrary } from '../features/chat-library/ChatLibrary'
import type { ChatRouteState } from '../features/chat-timeline/chatRouteState'

export default function ChatBoard({
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
  return (
    <ChatLibrary
      summariesByConvId={summariesByConvId}
      aiConfig={aiConfig}
      onGotoSettings={onGotoSettings}
      routeConversationId={routeConversationId}
      chatRouteState={chatRouteState}
      onConversationChange={onConversationChange}
      onChatRouteStateChange={onChatRouteStateChange}
    />
  )
}
