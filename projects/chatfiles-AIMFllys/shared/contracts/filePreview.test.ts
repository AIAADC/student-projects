import assert from 'node:assert/strict'
import test from 'node:test'

import * as contracts from './index.js'

test('publishes strict schemas for every JSON file-preview response', () => {
  for (const name of [
    'archivePreviewSchema', 'databasePreviewSchema', 'fileInspectionSchema', 'voicePreviewSchema',
  ] as const) {
    assert.equal(typeof contracts[name]?.safeParse, 'function', name)
  }
  assert.equal(contracts.archivePreviewSchema?.safeParse({
    path: '', size: 1, modified: new Date(0).toISOString(), format: '.zip', readable: true,
    entries: [{ name: '中文/', directory: true }],
  }).success, true)
  assert.equal(contracts.fileInspectionSchema?.safeParse({
    path: '', size: 1, modified: new Date(0).toISOString(), mime: 'text/plain', ext: '.txt',
    headerHex: '61', headerAscii: 'a', sampledBytes: 1,
    strings: [{ offset: 0, encoding: 'utf8', text: '中文🙂' }],
  }).success, true)
})
