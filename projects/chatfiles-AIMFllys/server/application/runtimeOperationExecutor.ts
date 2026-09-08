import path from 'node:path'

import type { AgentRequestConfig } from '../../shared/contracts/aiAgent.js'
import type { OperationDependency, OperationName } from '../../shared/contracts/operations.js'
import { readActiveProductSet } from '../data/catalogReader.js'
import { openCatalogArtifactDatabase, openCatalogWechatDatabase } from '../data/productDatabases.js'
import { readDocument } from '../services/documents/readDocument.js'
import { createLinkPreviewService } from '../services/linkPreview/linkPreviewService.js'
import { createRuntimeSearch } from '../services/search/searchRuntime.js'
import { inspectSearchIndexStatus } from '../services/search/searchSchema.js'
import { createArtifactAccountRootProvider, createArtifactSourceResolver } from '../wechat/artifactSourceResolver.js'
import {
  createOperationHandlers,
  OperationHandlerError,
  type OperationHandlerDependencies,
} from './operationHandlers.js'
import { createOperationExecutor, OperationExecutionError } from './operationExecutor.js'

export type RuntimeOperationAdapters = {
  readActive: typeof readActiveProductSet
  openWechat: typeof openCatalogWechatDatabase
  openArtifacts: typeof openCatalogArtifactDatabase
}

type RuntimeOperationOptions = {
  projectRoot: string
  config: AgentRequestConfig
  signal?: AbortSignal
  adapters?: Partial<RuntimeOperationAdapters>
}

const defaultAdapters: RuntimeOperationAdapters = {
  readActive: readActiveProductSet,
  openWechat: openCatalogWechatDatabase,
  openArtifacts: openCatalogArtifactDatabase,
}

function unavailable(operation: OperationName, dependency: OperationDependency) {
  return new OperationExecutionError('unavailable', operation, dependency)
}

function mapToolError(error: unknown, operation: OperationName) {
  if (!(error instanceof OperationHandlerError)) return new OperationExecutionError('operation_failed', operation)
  if (error.code === 'not_found') return new OperationExecutionError('not_found', operation)
  if (error.code === 'unavailable') return new OperationExecutionError('unavailable', operation)
  return new OperationExecutionError('operation_failed', operation)
}

function probe(open: () => { db: { close: () => void } | null }) {
  let opened: { db: { close: () => void } | null } | undefined
  try {
    opened = open()
    return opened.db ? 'ready' as const : 'unavailable' as const
  } catch {
    return 'unavailable' as const
  } finally {
    try { opened?.db?.close() } catch { /* A failed status probe remains unavailable. */ }
  }
}

export function createRuntimeOperationExecutor(options: RuntimeOperationOptions) {
  const adapters = { ...defaultAdapters, ...options.adapters }

  return createOperationExecutor<Partial<OperationHandlerDependencies>>({
    async openResources(operation, dependencies) {
      if (dependencies.length === 0) return { resources: {}, close() {} }
      const active = adapters.readActive(options.projectRoot)
      const readActive = () => active
      let wechat: ReturnType<typeof openCatalogWechatDatabase> | undefined
      let artifacts: ReturnType<typeof openCatalogArtifactDatabase> | undefined
      let search: ReturnType<typeof createRuntimeSearch> | undefined
      const resources: Partial<OperationHandlerDependencies> = {}
      const close = () => {
        try { search?.close() } catch { /* A rejected derived index never blocks cleanup. */ }
        try { artifacts?.db?.close() } catch { /* A rejected asset lease never blocks cleanup. */ }
        try { wechat?.db?.close() } catch { /* A rejected chat lease never blocks cleanup. */ }
      }
      try {
        if (dependencies.includes('chat')) {
          wechat = adapters.openWechat(options.projectRoot, readActive)
          const fingerprint = active.status.products.wechat.fingerprint
          if (!wechat.db || !fingerprint) throw unavailable(operation, 'chat')
          resources.wechatDb = wechat.db
          resources.searchMessages = async (input) => {
            search ??= createRuntimeSearch({
              wechatDb: wechat!.db!, projectRoot: options.projectRoot,
              sourceFingerprint: fingerprint, config: options.config,
              ...(options.signal ? { signal: options.signal } : {}),
            })
            return await search.search(input)
          }
        }
        if (dependencies.includes('assets')) {
          artifacts = adapters.openArtifacts(options.projectRoot, readActive)
          if (!artifacts.db) throw unavailable(operation, 'assets')
          resources.artifactDb = artifacts.db
        }
        if (dependencies.includes('documents')) {
          if (!artifacts?.db) throw unavailable(operation, 'documents')
          const resolver = createArtifactSourceResolver({
            assetDb: artifacts.db,
            accountRootProvider: createArtifactAccountRootProvider({ projectRoot: options.projectRoot }),
            bundleRoot: artifacts.bundleRoot ?? undefined,
          })
          resources.readDocument = async (assetId, maxCharacters) => (
            await readDocument(resolver, { assetId, maxCharacters })
          )
        }
        if (dependencies.includes('link')) {
          if (!artifacts?.db) throw unavailable(operation, 'link')
          const previews = createLinkPreviewService({
            cacheDir: path.join(options.projectRoot, 'work', 'link-preview-cache'),
          })
          resources.resolveLinkPreview = async (assetId, url) => await previews.resolve(assetId, url)
        }
        return { resources, close }
      } catch (error) {
        close()
        throw error
      }
    },
    async executeOperation(operation, input, resources) {
      if (operation === 'status') {
        const active = adapters.readActive(options.projectRoot)
        const readActive = () => active
        return {
          name: '午夜书斋本地只读接口', version: 2,
          wechat: probe(() => adapters.openWechat(options.projectRoot, readActive)),
          artifacts: probe(() => adapters.openArtifacts(options.projectRoot, readActive)),
          catalog: active.status.catalog,
          products: active.status.products,
          derived: { search: inspectSearchIndexStatus(
            path.join(options.projectRoot, 'data', 'ai-index.current.db'),
            active.status.products.wechat.fingerprint,
          ) },
        }
      }
      try {
        return await createOperationHandlers(resources).execute(operation, input)
      } catch (error) {
        throw mapToolError(error, operation)
      }
    },
  })
}
