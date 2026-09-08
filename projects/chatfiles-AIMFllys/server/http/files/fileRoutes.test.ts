import assert from 'node:assert/strict'
import test from 'node:test'

import type { FileApplicationService } from '../../application/files/fileApplicationService.js'
import { FileApplicationError } from '../../application/files/fileApplicationService.js'
import type { FileRef } from '../../domain/files/fileCapabilityPolicy.js'
import { withServer } from '../../routes/wechatRouteTestFixtures.js'
import { createFileRoutes } from './fileRoutes.js'

function fakeService(calls: Array<{ operation: string; ref: FileRef; extra?: unknown }>): FileApplicationService {
  const record = (operation: string, ref: FileRef, extra?: unknown) => calls.push({ operation, ref, extra })
  return {
    describe: async (ref) => ({ ref, name: '中文.txt', preview: 'text', size: 12, artifactCapabilities: [] }),
    openContent: async (ref) => { record('content', ref); return { descriptor: await Promise.resolve({ ref, name: '中文.txt', preview: 'text', size: 12, artifactCapabilities: [] }), target: 'unused' } },
    readText: async (ref) => { record('text', ref); return { descriptor: await Promise.resolve({ ref, name: '中文.txt', preview: 'text', size: 12, artifactCapabilities: [] }), target: 'unused', text: '中文正文' } },
    readArchive: async (ref) => { record('archive', ref); return { path: '中文.zip', size: 12, modified: new Date(0).toISOString(), format: '.zip', readable: true, entries: [] } },
    readDatabase: async (ref) => { record('database', ref); return { path: '中文.db', size: 12, modified: new Date(0).toISOString(), readable: true, header: '', tables: [] } },
    inspect: async (ref) => { record('inspect', ref); return { path: '中文.txt', size: 12, modified: new Date(0).toISOString(), mime: 'text/plain', ext: '.txt', headerHex: '', headerAscii: '', sampledBytes: 0, strings: [] } },
    openThumbnail: async (ref, width) => { record('thumbnail', ref, width); return { descriptor: await Promise.resolve({ ref, name: '中文.txt', preview: 'image', size: 12, artifactCapabilities: [] }), target: 'unused.webp' } },
    readVoice: async (ref, url) => { record('voice', ref, url); return { path: '中文.amr', size: 12, modified: new Date(0).toISOString(), sourceFormat: '.amr', playable: true, transcodedUrl: url } },
    openVoiceAudio: async (ref) => { record('voiceAudio', ref); return { descriptor: await Promise.resolve({ ref, name: '中文.amr', preview: 'voice', size: 12, artifactCapabilities: [] }), target: 'unused.wav' } },
  }
}

test('keeps legacy URLs while routing identical IDs through explicit archive and source scopes', async () => {
  const calls: Array<{ operation: string; ref: FileRef; extra?: unknown }> = []
  await withServer(createFileRoutes({ service: fakeService(calls) }), async (baseUrl) => {
    for (const url of [
      '/api/file/same/text',
      '/api/source-file/same/text',
      '/api/v1/files/archive/same/text',
    ]) {
      const response = await fetch(`${baseUrl}${url}`)
      assert.equal(response.status, 200)
      assert.equal(await response.text(), '中文正文')
    }
  })
  assert.deepEqual(calls.map((call) => call.ref.scope), ['archive', 'source', 'archive'])
})

test('validates thumbnail limits and maps application errors to the shared JSON envelope', async () => {
  const service = fakeService([])
  service.readDatabase = async () => { throw new FileApplicationError('unsupported_file_capability') }
  await withServer(createFileRoutes({ service }), async (baseUrl) => {
    const width = await fetch(`${baseUrl}/api/file/same/thumb?w=-1`)
    assert.equal(width.status, 400)
    assert.deepEqual(await width.json(), { error: 'Request failed', code: 'invalid_thumbnail_width' })
    const unsupported = await fetch(`${baseUrl}/api/source-file/same/database`)
    assert.equal(unsupported.status, 415)
    assert.deepEqual(await unsupported.json(), { error: 'Request failed', code: 'unsupported_file_capability' })
  })
})

test('keeps voice URLs compatible and returns path-free inspection data', async () => {
  const calls: Array<{ operation: string; ref: FileRef; extra?: unknown }> = []
  await withServer(createFileRoutes({ service: fakeService(calls) }), async (baseUrl) => {
    const voice = await fetch(`${baseUrl}/api/source-file/same/voice`)
    assert.match(JSON.stringify(await voice.json()), /\/api\/source-file\/same\/voice\.wav/u)
    const inspected = await fetch(`${baseUrl}/api/file/same/inspect`)
    const body = JSON.stringify(await inspected.json())
    assert.match(body, /中文\.txt/u)
    assert.doesNotMatch(body, /private|unused/u)
  })
})
