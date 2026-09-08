import assert from 'node:assert/strict'
import test from 'node:test'

import type { LibraryManifest, SourceFileManifest } from '../../../shared/contracts/files.js'
import { createRuntimeFileApplicationService } from './runtimeFileApplicationService.js'

test('loads archive and source manifests from the injected project root', async () => {
  const roots: string[] = []
  const archive: LibraryManifest = {
    generatedAt: new Date(0).toISOString(), roots: [], files: [],
    stats: { discovered: 0, archived: 0, duplicatesSkipped: 0, bytes: 0 },
  }
  const source: SourceFileManifest = {
    generatedAt: new Date(0).toISOString(), roots: [], files: [],
    stats: { files: 0, bytes: 0, databaseCandidates: 0, mediaCandidates: 0, textCandidates: 0 },
  }
  const service = createRuntimeFileApplicationService('D:\\fixture-root', {
    loadArchiveManifest(projectRoot) { roots.push(`archive:${projectRoot}`); return archive },
    loadSourceManifest(projectRoot) { roots.push(`source:${projectRoot}`); return source },
    artifactProvider: {
      describe: async (id) => ({
        ref: { scope: 'artifact', id }, name: '素材.png', preview: 'image', size: 12,
        artifactCapabilities: ['content'],
      }),
      open: async () => ({ status: 'available', target: 'C:\\private\\素材.png' }),
    },
  })
  await assert.rejects(service.describe({ scope: 'archive', id: 'a'.repeat(20) }), /file_not_found/u)
  await assert.rejects(service.describe({ scope: 'source', id: 'a'.repeat(20) }), /file_not_found/u)
  assert.equal((await service.describe({ scope: 'artifact', id: 'a'.repeat(64) })).name, '素材.png')
  assert.deepEqual(roots, ['archive:D:\\fixture-root', 'source:D:\\fixture-root'])
})
