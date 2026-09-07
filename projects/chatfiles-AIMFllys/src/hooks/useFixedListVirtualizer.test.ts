import assert from 'node:assert/strict'
import test from 'node:test'

import { calculateFixedListWindow } from './useFixedListVirtualizer.js'

const base = {
  count: 1_035,
  gap: 2,
  itemHeight: 68,
  listTop: 200,
  overscan: 6,
  retainedIndices: [] as number[],
  scrollTop: 0,
  viewportHeight: 560,
}

test('calculates an empty fixed list without mounting phantom rows', () => {
  assert.deepEqual(calculateFixedListWindow({ ...base, count: 0 }), {
    start: 0,
    end: 0,
    indices: [],
    totalHeight: 0,
  })
})

test('mounts only the leading overscan while the list is below the viewport', () => {
  const window = calculateFixedListWindow({ ...base, listTop: 800 })

  assert.equal(window.start, 0)
  assert.equal(window.end, 6)
  assert.deepEqual(window.indices, [0, 1, 2, 3, 4, 5])
  assert.equal(window.totalHeight, 72_448)
})

test('keeps a middle viewport bounded and merges retained rows without filling the gap', () => {
  const window = calculateFixedListWindow({
    ...base,
    retainedIndices: [0, 500, 1_034, 1_034, -1, 1_035],
    scrollTop: 35_200,
  })

  assert.equal(window.start, 494)
  assert.equal(window.end, 514)
  assert.equal(window.indices.length, 22)
  assert.deepEqual(window.indices.slice(0, 2), [0, 494])
  assert.deepEqual(window.indices.slice(-2), [513, 1_034])
})

test('clamps the virtual window to the final rows at the bottom', () => {
  const window = calculateFixedListWindow({
    ...base,
    scrollTop: 72_300,
    viewportHeight: 500,
  })

  assert.equal(window.end, 1_035)
  assert.ok(window.start >= 1_024)
  assert.ok(window.indices.length < 20)
})
