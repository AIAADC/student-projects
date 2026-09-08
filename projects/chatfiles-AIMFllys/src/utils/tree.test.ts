import assert from 'node:assert/strict'
import test from 'node:test'

import { archiveUrl, inspectUrl, type BrowsableFile } from './tree.js'

test('uses structured artifact endpoints for binary inspection and archive listings', () => {
  const artifact = {
    id: 'a'.repeat(64),
    storage: 'artifact',
    contentUrl: `/api/wechat/artifact/${'a'.repeat(64)}/content`,
  } as BrowsableFile

  assert.equal(inspectUrl(artifact), `/api/v1/files/artifact/${artifact.id}/inspect`)
  assert.equal(archiveUrl(artifact), `/api/v1/files/artifact/${artifact.id}/archive`)
})
