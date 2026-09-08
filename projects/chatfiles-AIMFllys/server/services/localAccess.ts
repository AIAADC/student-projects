import { OperationExecutionError } from '../application/operationExecutor.js'
import { operationCatalog, type OperationName, type OperationOutput } from '../../shared/contracts/operations.js'

export type LocalStatus = OperationOutput<'status'>

export type LocalAccessBackend = {
  status: () => Promise<LocalStatus>
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>
}

export type LocalAccessService = {
  status: () => Promise<LocalStatus>
  conversations: (input?: { query?: string; limit?: number }) => Promise<unknown>
  search: (input: { query: string; conversationId?: string; sender?: string; after?: number; before?: number; limit?: number }) => Promise<unknown>
  artifacts: (input: { query?: string; conversationId?: string; category?: 'all' | 'work' | 'document' | 'skill' | 'link'; limit?: number }) => Promise<unknown>
  readDocument: (input: { assetId: string; maxCharacters?: number }) => Promise<unknown>
  messageContext: (input: { messageUid: string; radius?: number }) => Promise<unknown>
}

export class LocalAccessError extends Error {
  constructor(public readonly code: 'invalid_input' | 'not_found' | 'database_unavailable' | 'operation_failed') {
    super(code)
    this.name = 'LocalAccessError'
  }
}

function operationInput(name: OperationName, input: Record<string, unknown>) {
  const parsed = operationCatalog[name].inputSchema.safeParse(input)
  if (!parsed.success) throw new LocalAccessError('invalid_input')
  return parsed.data as Record<string, unknown>
}

async function execute(backend: LocalAccessBackend, name: string, input: Record<string, unknown>) {
  try {
    return await backend.execute(name, input)
  } catch (error) {
    if (error instanceof LocalAccessError) throw error
    if (error instanceof OperationExecutionError) {
      if (error.code === 'invalid_input') throw new LocalAccessError('invalid_input')
      if (error.code === 'not_found') throw new LocalAccessError('not_found')
      if (error.code === 'unavailable') throw new LocalAccessError('database_unavailable')
    }
    throw new LocalAccessError('operation_failed')
  }
}

export function createLocalAccessService(backend: LocalAccessBackend): LocalAccessService {
  return {
    status: backend.status,
    async conversations(input = {}) {
      return await execute(backend, 'list_conversations', operationInput('list_conversations', input))
    },
    async search(input) {
      return await execute(backend, 'search_messages', operationInput('search_messages', input))
    },
    async artifacts(input) {
      return await execute(backend, 'search_artifacts', operationInput('search_artifacts', input))
    },
    async readDocument(input) {
      return await execute(backend, 'read_document', operationInput('read_document', input))
    },
    async messageContext(input) {
      return await execute(backend, 'get_message_context', operationInput('get_message_context', input))
    },
  }
}
