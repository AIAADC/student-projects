import assert from 'node:assert/strict'
import test from 'node:test'

import type { ArchivePreview, DatabasePreview, FileInspection, VoicePreview } from '../../../shared/contracts/files.js'
import type { FileDescriptor, FileOperation, FileScope } from '../../domain/files/fileCapabilityPolicy.js'
import {
  createFileApplicationService,
  FileApplicationError,
  type FileProvider,
} from './fileApplicationService.js'

function descriptor(scope: FileScope, preview = 'text', size = 12): FileDescriptor {
  return {
    ref: { scope, id: 'same-id' }, name: `${scope}-中文.txt`, preview, size,
    artifactCapabilities: scope === 'artifact' ? ['content', 'inspect'] : [],
  }
}

function provider(file: FileDescriptor, opened: FileOperation[]): FileProvider {
  return {
    describe: async (id) => id === file.ref.id ? file : null,
    open: async (_id, operation) => {
      opened.push(operation)
      return { status: 'available', target: `C:\\private\\${file.ref.scope}.txt` }
    },
  }
}

function service(files: Partial<Record<FileScope, FileProvider>>, maxArchiveBytes = 1_000) {
  const inspection: FileInspection = {
    path: 'C:\\private\\secret.txt', size: 12, modified: new Date(0).toISOString(),
    mime: 'text/plain', ext: '.txt', headerHex: '', headerAscii: '', sampledBytes: 0, strings: [],
  }
  const archive: ArchivePreview = {
    path: 'C:\\private\\secret.zip', size: 12, modified: new Date(0).toISOString(),
    format: '.zip', readable: false, error: 'failed at C:\\private\\secret.zip', entries: [],
  }
  const database: DatabasePreview = {
    path: 'C:\\private\\secret.db', size: 12, modified: new Date(0).toISOString(),
    readable: true, header: '', tables: [],
  }
  const voice: VoicePreview = {
    path: 'C:\\private\\secret.amr', size: 12, modified: new Date(0).toISOString(),
    sourceFormat: '.amr', playable: true,
  }
  return createFileApplicationService({
    providers: files,
    limits: { maxArchiveBytes, maxTextBytes: 5 * 1024 * 1024 },
    adapters: {
      readText: async () => '中文正文', inspectFile: () => inspection,
      inspectArchive: async () => archive, inspectDatabase: () => database,
      inspectVoice: (_target, url) => ({ ...voice, transcodedUrl: url }),
      thumbnail: (target) => `${target}.webp`, transcodeVoice: (target) => `${target}.wav`,
    },
  })
}

test('dispatches identical IDs through their explicit scopes', async () => {
  const archiveOpened: FileOperation[] = []
  const sourceOpened: FileOperation[] = []
  const files = service({
    archive: provider(descriptor('archive'), archiveOpened),
    source: provider(descriptor('source'), sourceOpened),
  })
  assert.match((await files.readText({ scope: 'archive', id: 'same-id' })).text, /中文/u)
  assert.match((await files.readText({ scope: 'source', id: 'same-id' })).text, /中文/u)
  assert.deepEqual(archiveOpened, ['textPreview'])
  assert.deepEqual(sourceOpened, ['textPreview'])
})

test('blocks only oversized archive preview before opening the file', async () => {
  const opened: FileOperation[] = []
  const files = service({ archive: provider(descriptor('archive', 'archive', 1_001), opened) })
  const preview = await files.readArchive({ scope: 'archive', id: 'same-id' })
  assert.equal(preview.readable, false)
  assert.equal(preview.blockedReason, 'archive_file_too_large')
  assert.deepEqual(opened, [])
  assert.match((await files.openContent({ scope: 'archive', id: 'same-id' })).target, /private/u)
  assert.deepEqual(opened, ['content'])
})

test('removes private paths from public preview DTOs and fails closed on unsupported operations', async () => {
  const opened: FileOperation[] = []
  const files = service({ archive: provider(descriptor('archive'), opened) })
  const inspected = await files.inspect({ scope: 'archive', id: 'same-id' })
  assert.equal(inspected.path, 'archive-中文.txt')
  assert.doesNotMatch(JSON.stringify(inspected), /C:\\private/u)
  await assert.rejects(
    files.readDatabase({ scope: 'archive', id: 'same-id' }),
    (error: unknown) => error instanceof FileApplicationError && error.code === 'unsupported_file_capability',
  )
})

test('reuses one descriptor lookup while preparing an archive preview', async () => {
  let descriptions = 0
  const opened: FileOperation[] = []
  const file = descriptor('archive', 'archive')
  const files = service({
    archive: {
      async describe() {
        descriptions += 1
        return file
      },
      async open(_id, operation) {
        opened.push(operation)
        return { status: 'available', target: 'C:\\private\\archive.zip' }
      },
    },
  })

  const preview = await files.readArchive(file.ref)

  assert.equal(descriptions, 1)
  assert.deepEqual(opened, ['archivePreview'])
  assert.equal(preview.error, 'preview_unavailable')
  assert.doesNotMatch(JSON.stringify(preview), /C:\\private/u)
})
