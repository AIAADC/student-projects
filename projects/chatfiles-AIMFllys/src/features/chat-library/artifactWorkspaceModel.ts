import type { ChatArtifactListItem, WechatConversation } from '../../types'
import type { ChatLibrarySelection } from './artifactModel'

export function selectionTitle(
  selection: ChatLibrarySelection,
  conversation?: WechatConversation,
) {
  if (selection.kind === 'conversation') return conversation?.display ?? '会话素材'
  return selection.id === 'library' ? '我的素材库' : '全部产出'
}

export function mergeUnique(
  current: ChatArtifactListItem[],
  incoming: ChatArtifactListItem[],
) {
  const ids = new Set(current.map((item) => item.id))
  return [...current, ...incoming.filter((item) => !ids.has(item.id))]
}
