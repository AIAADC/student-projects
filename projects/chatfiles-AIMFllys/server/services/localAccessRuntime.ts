import type { AgentRequestConfig } from '../../shared/contracts/aiAgent.js'
import { createRuntimeOperationExecutor } from '../application/runtimeOperationExecutor.js'
import { root } from '../utils/helpers.js'
import { createLocalAccessService, type LocalAccessBackend, type LocalStatus } from './localAccess.js'

const localSearchConfig: AgentRequestConfig = {
  baseURL: 'http://127.0.0.1', apiKey: '', model: 'local-access', temperature: 0,
  contextWindow: 8_000, contextStrategy: 'recent',
  embedding: {
    enabled: false, baseURL: 'http://127.0.0.1', apiKey: '', model: 'disabled', dimensions: 1, batchSize: 1,
  },
}

function runtimeBackend(projectRoot: string): LocalAccessBackend {
  const operations = createRuntimeLocalOperationExecutor(projectRoot)
  return {
    async status() {
      return await operations.execute('status', {}) as LocalStatus
    },
    async execute(name, input) {
      return await operations.execute(name, input)
    },
  }
}

export function createRuntimeLocalOperationExecutor(projectRoot = root) {
  return createRuntimeOperationExecutor({ projectRoot, config: localSearchConfig })
}

export function createRuntimeLocalAccessService(projectRoot = root) {
  return createLocalAccessService(runtimeBackend(projectRoot))
}
