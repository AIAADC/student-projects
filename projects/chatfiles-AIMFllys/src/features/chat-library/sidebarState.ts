export const SIDEBAR_COLLAPSED_KEY = 'chatfiles.chat-library.sidebar-collapsed'

export function parseSidebarCollapsed(value: string | null | undefined) {
  return value === 'true'
}

export function serializeSidebarCollapsed(value: boolean) {
  return value ? 'true' : 'false'
}
