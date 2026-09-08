export type Tab =
  | 'overview'
  | 'chat'
  | 'files'
  | 'insights'
  | 'academics'
  | 'media'
  | 'summary'
  | 'clues'
  | 'synthesis'
  | 'databases'
  | 'candidates'
  | 'knowledge'
  | 'ai'

const tabPaths: Record<Tab, string> = {
  overview: '/',
  chat: '/chat',
  files: '/files',
  insights: '/insights',
  academics: '/academics',
  media: '/media',
  knowledge: '/knowledge',
  summary: '/settings/summary',
  clues: '/settings/clues',
  synthesis: '/settings/synthesis',
  databases: '/settings/databases',
  candidates: '/settings/candidates',
  ai: '/settings/ai',
}

export const APP_ROUTES: ReadonlyArray<{ page: Tab; path: string }> = [
  { page: 'overview', path: '/' },
  { page: 'chat', path: '/chat' },
  { page: 'chat', path: '/chat/:conversationId' },
  { page: 'files', path: '/files' },
  { page: 'insights', path: '/insights' },
  { page: 'academics', path: '/academics' },
  { page: 'media', path: '/media' },
  { page: 'knowledge', path: '/knowledge' },
  { page: 'summary', path: '/settings/summary' },
  { page: 'clues', path: '/settings/clues' },
  { page: 'synthesis', path: '/settings/synthesis' },
  { page: 'databases', path: '/settings/databases' },
  { page: 'candidates', path: '/settings/candidates' },
  { page: 'ai', path: '/settings/ai' },
]

export function pathForTab(tab: Tab) {
  return tabPaths[tab]
}

export function chatConversationPath(conversationId: string) {
  return `${tabPaths.chat}/${encodeURIComponent(conversationId)}`
}

export function tabForPath(pathname: string): Tab {
  const normalizedPath = pathname.replace(/\/+$/u, '') || '/'
  const matchedPath = normalizedPath.toLowerCase()
  if (matchedPath === '/') return 'overview'
  if (matchedPath === '/chat' || matchedPath.startsWith('/chat/')) return 'chat'
  const found = (Object.entries(tabPaths) as Array<[Tab, string]>)
    .find(([, path]) => path !== '/' && matchedPath === path)
  return found?.[0] ?? 'overview'
}
