type TimelineParameters = {
  limit: number
  query?: string
  sender?: string
  before?: string
  after?: string
  around?: string
  aroundUid?: string
}

type TimelineDayParameters = {
  limit: number
  before?: string
  query?: string
  sender?: string
}

type ArtifactParameters = {
  conversationId?: string
  collection?: 'outputs' | 'library'
  tab: 'all' | 'work' | 'document' | 'skill' | 'link' | 'chatText'
  query?: string
  offset: number
  limit: number
}

export type FileScope = 'archive' | 'source' | 'artifact'
export type FileCapability = 'text' | 'archive' | 'database' | 'inspect' | 'voice' | 'content'

function conversationBase(conversationId: string) {
  return `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}`
}

function fileBase(scope: FileScope, fileId: string) {
  return `/api/v1/files/${scope}/${encodeURIComponent(fileId)}`
}

function append(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) params.set(key, value)
}

export const apiEndpoints = {
  overview: '/api/v1/overview',
  insights: '/api/v1/insights',
  library: '/api/v1/data/library',
  sourceLibrary: '/api/v1/data/source-library',
  knowledge: '/api/v1/data/knowledge',
  summary: '/api/v1/data/summary',
  chatClues: '/api/v1/data/chat-clues',
  chatSynthesis: '/api/v1/data/chat-synthesis',
  databaseAnalysis: '/api/v1/data/database-analysis',
  valueCandidates: '/api/v1/data/value-candidates',
  conversations: '/api/v1/chat/conversations',

  artifacts(input: ArtifactParameters) {
    const base = input.conversationId
      ? `${conversationBase(input.conversationId)}/artifacts`
      : '/api/v1/chat/artifacts'
    const params = new URLSearchParams({ tab: input.tab })
    if (input.collection === 'library') params.set('collection', 'library')
    append(params, 'q', input.query?.trim())
    params.set('offset', String(input.offset))
    params.set('limit', String(input.limit))
    return `${base}?${params}`
  },

  artifactMetadata(assetId: string) {
    return `/api/v1/chat/artifacts/${encodeURIComponent(assetId)}/metadata`
  },

  artifactThumbnail(assetId: string, width: number) {
    return `/api/v1/chat/artifacts/${encodeURIComponent(assetId)}/thumbnail?w=${width}`
  },

  artifactLinkPreview(assetId: string) {
    return `/api/v1/chat/artifacts/${encodeURIComponent(assetId)}/link-preview`
  },

  fileCapability(scope: FileScope, fileId: string, capability: FileCapability) {
    return `${fileBase(scope, fileId)}/${capability}`
  },

  fileContent(scope: FileScope, fileId: string) {
    return `${fileBase(scope, fileId)}/content`
  },

  fileThumbnail(scope: FileScope, fileId: string, width: number) {
    return `${fileBase(scope, fileId)}/thumb?w=${width}`
  },

  timeline(conversationId: string, input: TimelineParameters) {
    const params = new URLSearchParams({ limit: String(input.limit) })
    append(params, 'q', input.query?.trim())
    append(params, 'sender', input.sender)
    append(params, 'before', input.before)
    append(params, 'after', input.after)
    append(params, 'around', input.around)
    append(params, 'aroundUid', input.aroundUid)
    return `${conversationBase(conversationId)}/timeline?${params}`
  },

  timelineParticipants(conversationId: string, query = '') {
    const params = new URLSearchParams()
    append(params, 'q', query.trim())
    const suffix = params.size ? `?${params}` : ''
    return `${conversationBase(conversationId)}/timeline/participants${suffix}`
  },

  timelineDays(conversationId: string, input: TimelineDayParameters) {
    const params = new URLSearchParams({ limit: String(input.limit) })
    append(params, 'before', input.before)
    append(params, 'q', input.query?.trim())
    append(params, 'sender', input.sender)
    return `${conversationBase(conversationId)}/timeline/days?${params}`
  },
}
