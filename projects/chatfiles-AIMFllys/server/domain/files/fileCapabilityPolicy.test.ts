import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decideFileCapability,
  type FileDescriptor,
  type FileOperation,
  type FileScope,
} from './fileCapabilityPolicy.js'

function descriptor(scope: FileScope, preview: string, overrides: Partial<FileDescriptor> = {}): FileDescriptor {
  return {
    ref: { scope, id: 'same-public-id' },
    name: '说明.txt',
    preview,
    size: 128,
    artifactCapabilities: [],
    ...overrides,
  }
}

test('uses explicit scope instead of guessing the namespace from an identical ID', () => {
  const archive = decideFileCapability(descriptor('archive', 'database'), 'databasePreview')
  const source = decideFileCapability(descriptor('source', 'database'), 'databasePreview')
  assert.deepEqual(archive, { allowed: false, code: 'unsupported_file_capability' })
  assert.deepEqual(source, { allowed: true })
})

test('enforces the archive, source, and artifact capability matrix', () => {
  const cases: Array<[FileDescriptor, FileOperation, boolean]> = [
    [descriptor('archive', 'text'), 'textPreview', true],
    [descriptor('source', 'image'), 'thumbnail', true],
    [descriptor('archive', 'video'), 'thumbnail', true],
    [descriptor('source', 'archive'), 'archivePreview', true],
    [descriptor('archive', 'voice', { voiceSource: true }), 'voicePreview', true],
    [descriptor('source', 'voice', { voiceSource: true }), 'voiceAudio', true],
    [descriptor('archive', 'pdf'), 'textPreview', false],
    [descriptor('artifact', 'database'), 'databasePreview', false],
    [descriptor('artifact', 'voice'), 'voicePreview', false],
    [descriptor('artifact', 'voice', {
      voiceSource: true,
      artifactCapabilities: ['content'],
    }), 'voicePreview', true],
    [descriptor('artifact', 'voice', {
      voiceSource: true,
      artifactCapabilities: ['content'],
    }), 'voiceAudio', true],
    [descriptor('artifact', 'image', { artifactCapabilities: ['thumbnail'] }), 'thumbnail', true],
    [descriptor('artifact', 'image'), 'thumbnail', false],
    [descriptor('artifact', 'archive', { artifactCapabilities: ['archive'] }), 'archivePreview', true],
    [descriptor('archive', 'download'), 'content', true],
    [descriptor('source', 'download'), 'inspectPreview', true],
    [descriptor('artifact', 'download', { artifactCapabilities: ['content'] }), 'content', true],
  ]
  for (const [file, operation, allowed] of cases) {
    assert.equal(decideFileCapability(file, operation).allowed, allowed, `${file.ref.scope}:${operation}`)
  }
})

test('blocks only archive preview when the file budget is exceeded', () => {
  const file = descriptor('archive', 'archive', { size: 1_001 })
  assert.deepEqual(decideFileCapability(file, 'archivePreview', { maxArchiveBytes: 1_000 }), {
    allowed: false,
    code: 'preview_blocked',
    blockedReason: 'archive_file_too_large',
  })
  assert.deepEqual(decideFileCapability(file, 'content', { maxArchiveBytes: 1_000 }), { allowed: true })
})
