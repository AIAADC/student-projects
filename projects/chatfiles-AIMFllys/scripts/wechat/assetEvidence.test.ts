import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CANONICAL_MESSAGE_PRIMARY_KEY,
  RESOURCE_LOCATOR_FIELDS,
  RESOURCE_MESSAGE_PRIMARY_KEY,
  alignResourceMessage,
  type CanonicalMessage,
} from './assetEvidence.js'
import { exactMessage, exactProbe } from './assetEvidenceTestFixtures.js'
test('keeps resource message_id separate from canonical message_uid and requires raw_type', () => {
  assert.equal(RESOURCE_MESSAGE_PRIMARY_KEY, 'message_id')
  assert.equal(CANONICAL_MESSAGE_PRIMARY_KEY, 'message_uid')
  assert.deepEqual(RESOURCE_LOCATOR_FIELDS, [
    'chat_table',
    'message_table',
    'local_id',
    'normalized_type',
    'raw_type',
    'create_time',
    'server_id',
    'message_origin_source',
  ])

  const result = alignResourceMessage(exactProbe, [exactMessage])

  assert.deepEqual(result, {
    status: 'exact',
    resource_message_id: 'resource-message-7',
    message_uid: 'wxm:canonical-message-42',
    candidate_message_uids: ['wxm:canonical-message-42'],
    matched_fields: [...RESOURCE_LOCATOR_FIELDS],
    missing_fields: [],
    conflicting_fields: [],
  })
})

test('returns partial only for one uniquely matching incomplete locator', () => {
  const partialLocator = {
    ...exactProbe,
    create_time: undefined,
    server_id: undefined,
  }

  const result = alignResourceMessage(partialLocator, [exactMessage])

  assert.equal(result.status, 'partial')
  assert.equal(result.message_uid, 'wxm:canonical-message-42')
  assert.deepEqual(result.candidate_message_uids, ['wxm:canonical-message-42'])
  assert.deepEqual(result.missing_fields, ['create_time', 'server_id'])
  assert.deepEqual(result.conflicting_fields, [])
})

test('returns missing when no canonical message matches the locator', () => {
  const result = alignResourceMessage({
    message_id: 'resource-message-missing',
    chat_table: 'Chat_missing',
    message_table: 'Msg_missing',
    local_id: 404,
  }, [exactMessage])

  assert.deepEqual(result, {
    status: 'missing',
    resource_message_id: 'resource-message-missing',
    message_uid: null,
    candidate_message_uids: [],
    matched_fields: [],
    missing_fields: [
      'normalized_type',
      'raw_type',
      'create_time',
      'server_id',
      'message_origin_source',
    ],
    conflicting_fields: [],
  })
})

test('does not treat server_id zero as a strong locator', () => {
  const zeroServerMessage: CanonicalMessage = {
    ...exactMessage,
    server_id: '0',
  }

  const result = alignResourceMessage({
    message_id: 'resource-message-zero-server',
    server_id: '0',
    message_origin_source: zeroServerMessage.message_origin_source,
  }, [zeroServerMessage])

  assert.equal(result.status, 'missing')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, [])
})

test('does not confirm a unique candidate from weak fields alone', () => {
  const result = alignResourceMessage({
    message_id: 'resource-message-weak-only',
    normalized_type: exactMessage.normalized_type,
    raw_type: exactMessage.raw_type,
    create_time: exactMessage.create_time,
  }, [exactMessage])

  assert.equal(result.status, 'missing')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, [])
})

test('uses canonical message_uid only when it is explicitly supplied', () => {
  const coincidentalResourceId = alignResourceMessage({
    message_id: exactMessage.message_uid,
  }, [exactMessage])
  assert.equal(coincidentalResourceId.status, 'missing')

  const explicitCanonicalUid = alignResourceMessage({
    message_id: 'resource-message-by-uid',
    message_uid: exactMessage.message_uid,
  }, [exactMessage])
  assert.equal(explicitCanonicalUid.status, 'partial')
  assert.equal(explicitCanonicalUid.resource_message_id, 'resource-message-by-uid')
  assert.equal(explicitCanonicalUid.message_uid, exactMessage.message_uid)
  assert.deepEqual(explicitCanonicalUid.matched_fields, ['message_uid'])
})

test('does not guess when one complete locator maps to more than one message_uid', () => {
  const duplicateLocator: CanonicalMessage = {
    ...exactMessage,
    message_uid: 'wxm:canonical-message-duplicate',
    source_db: 'message_1.db',
  }

  const result = alignResourceMessage(exactProbe, [
    exactMessage,
    duplicateLocator,
  ])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, [
    'wxm:canonical-message-42',
    'wxm:canonical-message-duplicate',
  ])
  assert.deepEqual(result.conflicting_fields, ['message_uid'])
})

test('sorts unique candidate message UIDs independently of input permutation', () => {
  const alpha = { ...exactMessage, message_uid: 'wxm:alpha', source_db: 'message_0.db' }
  const middle = { ...exactMessage, message_uid: 'wxm:middle', source_db: 'message_1.db' }
  const zeta = { ...exactMessage, message_uid: 'wxm:zeta', source_db: 'message_2.db' }

  const first = alignResourceMessage(exactProbe, [zeta, alpha, middle])
  const second = alignResourceMessage(exactProbe, [middle, zeta, alpha])

  assert.deepEqual(first.candidate_message_uids, ['wxm:alpha', 'wxm:middle', 'wxm:zeta'])
  assert.deepEqual(second.candidate_message_uids, first.candidate_message_uids)
})

test('preserves duplicate row occurrences as one-to-many evidence even for the same object reference', () => {
  const result = alignResourceMessage(exactProbe, [
    exactMessage,
    exactMessage,
  ])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, ['wxm:canonical-message-42'])
  assert.deepEqual(result.conflicting_fields, ['message_uid'])
})

test('distinguishes high 64-bit app subtypes that share the same normalized type', () => {
  const result = alignResourceMessage({
    ...exactProbe,
    raw_type: '34359738417',
  }, [exactMessage])

  assert.deepEqual(result, {
    status: 'conflict',
    resource_message_id: 'resource-message-7',
    message_uid: null,
    candidate_message_uids: ['wxm:canonical-message-42'],
    matched_fields: [
      'chat_table',
      'message_table',
      'local_id',
      'normalized_type',
      'create_time',
      'server_id',
      'message_origin_source',
    ],
    missing_fields: [],
    conflicting_fields: ['raw_type'],
  })
})

test('reports every conflicting locator field instead of accepting a positional near-match', () => {
  const result = alignResourceMessage({
    ...exactProbe,
    normalized_type: 43,
    raw_type: '43',
    create_time: exactMessage.create_time + 1,
  }, [exactMessage])

  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.conflicting_fields, ['normalized_type', 'raw_type', 'create_time'])
})

test('reports conflict when independent strong locators point at different messages', () => {
  const otherMessage: CanonicalMessage = {
    ...exactMessage,
    message_uid: 'wxm:canonical-message-99',
    source_db: 'message_1.db',
    local_id: 99,
    server_id: 'server-other',
  }

  const result = alignResourceMessage({
    ...exactProbe,
    message_uid: exactMessage.message_uid,
    local_id: otherMessage.local_id,
    server_id: otherMessage.server_id,
  }, [exactMessage, otherMessage])

  assert.equal(result.status, 'conflict')
  assert.equal(result.message_uid, null)
  assert.deepEqual(result.candidate_message_uids, [
    'wxm:canonical-message-42',
    'wxm:canonical-message-99',
  ])
  assert.deepEqual(result.conflicting_fields, [
    'message_uid',
    'local_id',
    'server_id',
  ])
})
