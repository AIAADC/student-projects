import { chatConversationPath, pathForTab } from '../../app/navigation'

import { archiveDateSchema } from '../../../shared/contracts/primitives'

export type ChatRouteState = {
  sender: string
  day: string
  query: string
  messageUid: string
}

export type ChatRouteLocation = {
  conversationId?: string
  state: ChatRouteState
}

export function emptyChatRouteState(): ChatRouteState {
  return { sender: '', day: '', query: '', messageUid: '' }
}

function bounded(value: string | null, maximum: number) {
  const normalized = value?.trim() ?? ''
  return normalized && [...normalized].length <= maximum && !normalized.includes('\u0000')
    ? normalized
    : ''
}

function day(value: string | null) {
  const normalized = value?.trim() ?? ''
  return archiveDateSchema.safeParse(normalized).success
    ? normalized
    : ''
}

export function parseChatRouteState(search: URLSearchParams): ChatRouteState {
  return {
    sender: bounded(search.get('sender'), 512),
    day: day(search.get('day')),
    query: bounded(search.get('q'), 200),
    messageUid: bounded(search.get('messageUid'), 512),
  }
}

export function serializeChatRouteState(state: ChatRouteState) {
  const search = new URLSearchParams()
  if (state.query) search.set('q', state.query)
  if (state.sender) search.set('sender', state.sender)
  if (state.day) search.set('day', state.day)
  if (state.messageUid) search.set('messageUid', state.messageUid)
  return search
}

export function selectChatConversation(conversationId?: string): ChatRouteLocation {
  return { conversationId, state: emptyChatRouteState() }
}

export function patchChatRouteLocation(
  location: ChatRouteLocation,
  patch: Partial<ChatRouteState>,
): ChatRouteLocation {
  const filterChanged = (
    Object.hasOwn(patch, 'sender') && patch.sender !== location.state.sender
  ) || (
    Object.hasOwn(patch, 'query') && patch.query !== location.state.query
  )
  const state = {
    ...location.state,
    ...(filterChanged ? { day: '', messageUid: '' } : {}),
    ...patch,
  }
  return { ...location, state }
}

export function chatRouteUrl(location: ChatRouteLocation) {
  const pathname = location.conversationId
    ? chatConversationPath(location.conversationId)
    : pathForTab('chat')
  const search = serializeChatRouteState(location.state).toString()
  return search ? `${pathname}?${search}` : pathname
}
