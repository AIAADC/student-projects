import assert from 'node:assert/strict'
import test from 'node:test'

import { alignResourceMessage, type CanonicalMessage } from './assetEvidence.js'
import { exactMessage, exactProbe } from './assetEvidenceTestFixtures.js'
test('treats duplicate message_uid rows as a primary-key conflict', () => {
  const conflictingDuplicate: CanonicalMessage = {
    ...exactMessage,
    normalized_type: 43,
    raw_type: '43',
  }

  const result = alignResourceMessage({
    message_id: 'resource-message-duplicate-uid',
    message_uid: exactMessage.message_uid,
  }, [
    exactMessage,
    conflictingDuplicate,
  ])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, ['wxm:canonical-message-42'])
  assert.deepEqual(result.conflicting_fields, ['message_uid', 'normalized_type', 'raw_type'])
})
test('does not let a positional match override a conflicting message_uid', () => {
  const result = alignResourceMessage({
    ...exactProbe,
    message_uid: 'wxm:canonical-message-stale',
  }, [exactMessage])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, ['wxm:canonical-message-42'])
  assert.deepEqual(result.conflicting_fields, ['message_uid'])
})

test('does not use message_origin_source to choose a canonical shard', () => {
  const otherShardMessage: CanonicalMessage = {
    ...exactMessage,
    message_uid: 'wxm:canonical-message-other-shard',
    source_db: 'message_1.db',
    message_origin_source: 1,
  }

  const result = alignResourceMessage({
    ...exactProbe,
    message_origin_source: 1,
  }, [exactMessage, otherShardMessage])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, [
    'wxm:canonical-message-42',
    'wxm:canonical-message-other-shard',
  ])
  assert.deepEqual(result.conflicting_fields, ['message_uid', 'message_origin_source'])
})
