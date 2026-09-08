import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { removeStagingFile } from './stagingFile.js'

test('surfaces staging cleanup failures while allowing an absent file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-staging-cleanup-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, 'locked-as-directory')
  fs.mkdirSync(directory)
  assert.throws(() => removeStagingFile(directory), (error: unknown) => (
    error instanceof Error
    && error.message === 'MEDIA_STAGING_CLEANUP_FAILED'
    && error.cause instanceof Error
  ))
  assert.doesNotThrow(() => removeStagingFile(path.join(root, 'missing')))
})
