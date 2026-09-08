import assert from 'node:assert/strict'
import test from 'node:test'
import type { DatabaseSync } from 'node:sqlite'

import type { FileProvider } from '../../application/files/fileApplicationService.js'
import { createRuntimeArtifactFileProvider } from './runtimeArtifactFileProvider.js'

test('opens and closes an artifact lease for each description and representation', async () => {
  let opened = 0
  let closed = 0
  const provider: FileProvider = {
    describe: async (id) => ({
      ref: { scope: 'artifact', id }, name: '中文.png', preview: 'image', size: 12,
      artifactCapabilities: ['content'],
    }),
    open: async () => ({ status: 'available', target: 'C:\\private\\中文.png' }),
  }
  const runtime = createRuntimeArtifactFileProvider('D:\\fixture', {
    openArtifacts() {
      opened += 1
      return {
        db: { close() { closed += 1 } } as unknown as DatabaseSync,
        bundleRoot: 'D:\\fixture\\bundle',
      }
    },
    createProvider: () => provider,
  })
  assert.equal((await runtime.describe('a'.repeat(64)))?.name, '中文.png')
  assert.equal((await runtime.open('a'.repeat(64), 'content')).status, 'available')
  assert.equal(opened, 2)
  assert.equal(closed, 2)
})

test('fails closed without an active artifact database', async () => {
  const runtime = createRuntimeArtifactFileProvider('D:\\fixture', {
    openArtifacts: () => ({ db: null, bundleRoot: null }),
  })
  assert.equal(await runtime.describe('a'.repeat(64)), null)
  assert.equal((await runtime.open('a'.repeat(64), 'content')).status, 'unavailable')
})
