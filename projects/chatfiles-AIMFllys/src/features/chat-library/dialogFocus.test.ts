import assert from 'node:assert/strict'
import test from 'node:test'
import { nextDialogFocusIndex } from './dialogFocus'

test('wraps dialog focus forward and backward without escaping the dialog', () => {
  assert.equal(nextDialogFocusIndex(2, 3, false), 0)
  assert.equal(nextDialogFocusIndex(0, 3, true), 2)
})

test('moves focus entering from outside to the appropriate dialog boundary', () => {
  assert.equal(nextDialogFocusIndex(-1, 3, false), 0)
  assert.equal(nextDialogFocusIndex(-1, 3, true), 2)
})

test('reports no target when a dialog has no focusable controls', () => {
  assert.equal(nextDialogFocusIndex(-1, 0, false), -1)
})
