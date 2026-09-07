import assert from 'node:assert/strict'
import test from 'node:test'

import { canonicalPersonId } from './personIdentity.js'

test('creates a stable owner-scoped person id without using a display name', () => {
  const first = canonicalPersonId('wxid_owner', 'wxid_member')
  assert.equal(first, canonicalPersonId('wxid_owner', 'wxid_member'))
  assert.notEqual(first, canonicalPersonId('wxid_other_owner', 'wxid_member'))
  assert.notEqual(first, canonicalPersonId('wxid_owner', 'wxid_other_member'))
  assert.match(first, /^wxp:[0-9a-f]{64}$/u)
  assert.throws(() => canonicalPersonId('', 'wxid_member'))
})
