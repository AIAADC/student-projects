import assert from 'node:assert/strict'
import test from 'node:test'

import {
  archiveDay,
  formatArchiveTimestamp,
  resolveArchiveTimeZone,
} from './archiveTime.js'

test('defaults every archive product to Asia/Shanghai and validates configured IANA zones', () => {
  assert.equal(resolveArchiveTimeZone(undefined), 'Asia/Shanghai')
  assert.equal(resolveArchiveTimeZone(' America/Los_Angeles '), 'America/Los_Angeles')
  assert.throws(() => resolveArchiveTimeZone('localtime'), /IANA time zone/u)
})

test('formats source seconds with one explicit archive day and numeric UTC offset', () => {
  assert.equal(archiveDay(0, 'Asia/Shanghai'), '1970-01-01')
  assert.equal(formatArchiveTimestamp(0, 'Asia/Shanghai'), '1970-01-01 08:00:00 +08:00')
  assert.equal(archiveDay(1_704_067_200, 'America/Los_Angeles'), '2023-12-31')
})
