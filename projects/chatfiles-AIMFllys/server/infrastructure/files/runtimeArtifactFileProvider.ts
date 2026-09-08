import type { DatabaseSync } from 'node:sqlite'

import type { FileOperation } from '../../domain/files/fileCapabilityPolicy.js'
import type { FileProvider } from '../../domain/files/fileProvider.js'
import { openCatalogArtifactDatabase } from '../../data/productDatabases.js'
import {
  createArtifactAccountRootProvider,
  createArtifactSourceResolver,
} from '../../wechat/artifactSourceResolver.js'
import { createArtifactFileProvider } from './artifactFileProvider.js'

type ArtifactLease = { db: DatabaseSync | null; bundleRoot: string | null }
type RuntimeArtifactAdapters = {
  openArtifacts: (projectRoot: string) => ArtifactLease
  createProvider: (db: DatabaseSync, bundleRoot: string | null, projectRoot: string) => ReturnType<typeof createArtifactFileProvider>
}

const defaults: RuntimeArtifactAdapters = {
  openArtifacts: (projectRoot) => openCatalogArtifactDatabase(projectRoot),
  createProvider(db, bundleRoot, projectRoot) {
    return createArtifactFileProvider(createArtifactSourceResolver({
      assetDb: db,
      accountRootProvider: createArtifactAccountRootProvider({ projectRoot }),
      bundleRoot: bundleRoot ?? undefined,
      projectRoot,
    }))
  },
}

export function createRuntimeArtifactFileProvider(
  projectRoot: string,
  adapters: Partial<RuntimeArtifactAdapters> = {},
): FileProvider {
  const runtime = { ...defaults, ...adapters }
  return {
    async describe(id: string) {
      const lease = runtime.openArtifacts(projectRoot)
      if (!lease.db) return null
      try {
        return await runtime.createProvider(lease.db, lease.bundleRoot, projectRoot).describe(id)
      } finally {
        lease.db.close()
      }
    },
    async open(id: string, operation: FileOperation) {
      const lease = runtime.openArtifacts(projectRoot)
      if (!lease.db) return { status: 'unavailable' }
      try {
        return await runtime.createProvider(lease.db, lease.bundleRoot, projectRoot).open(id, operation)
      } finally {
        lease.db.close()
      }
    },
  }
}
