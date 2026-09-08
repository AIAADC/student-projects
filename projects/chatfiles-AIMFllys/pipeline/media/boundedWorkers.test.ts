import assert from 'node:assert/strict'
import test from 'node:test'
import { mapWithConcurrency } from './boundedWorkers.js'

test('runs a fixed worker set without reordering results', async () => {
  let active = 0
  let maximum = 0
  const results = await mapWithConcurrency(
    Array.from({ length: 12 }, (_, index) => index),
    2,
    async (index) => {
      active++
      maximum = Math.max(maximum, active)
      await new Promise((resolve) => setTimeout(resolve, 2))
      active--
      return index * 2
    },
  )

  assert.equal(maximum, 2)
  assert.deepEqual(results, Array.from({ length: 12 }, (_, index) => index * 2))
})

test('rejects invalid worker limits before starting work', async () => {
  let started = false
  await assert.rejects(
    mapWithConcurrency([1], 0, async () => {
      started = true
      return 1
    }),
    /Worker limit must be positive/u,
  )
  assert.equal(started, false)
})
