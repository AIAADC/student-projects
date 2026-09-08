import assert from 'node:assert/strict'
import test from 'node:test'
import { dataCatalogStatusSchema, dataProductStatusSchema } from './dataStatus.js'

const digest = `sha256:${'b'.repeat(64)}`

test('exposes path-free product health with schema, run, fingerprint, and counts', () => {
  const status = dataProductStatusSchema.parse({
    schemaVersion: 2,runId: '运行-二',fingerprint: digest,state: 'degraded',
    counts: { messages: 10, unavailable: 2 },issues: ['media_partial'],
  })
  assert.equal(status.runId, '运行-二')
  assert.throws(() => dataProductStatusSchema.parse({ ...status,path: 'D:\\private' }))
})

test('distinguishes missing, invalid, and recovery-required catalogs without local paths', () => {
  const status = dataCatalogStatusSchema.parse({
    state: 'recovery_required',previous: 'ready',transactionId: 'txn-1',
  })
  assert.equal(status.state, 'recovery_required')
  assert.throws(() => dataCatalogStatusSchema.parse({ ...status,journalPath: 'data/private' }))
})
