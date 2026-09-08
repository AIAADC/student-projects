import assert from 'node:assert/strict'
import test from 'node:test'

import { extractText } from './messageParsing.js'
import { truncateCodePoints } from './unicodeText.js'

test('truncateCodePoints keeps the boundary code point intact', () => {
  const emoji = String.fromCodePoint(0x1f600)

  assert.equal(truncateCodePoints(`ab${emoji}tail`, 3), `ab${emoji}`)
  assert.equal(truncateCodePoints(`ab${emoji}`, 0), '')
})

test('truncates system text at a Unicode code-point boundary', () => {
  const emoji = String.fromCodePoint(0x1f600)
  const content = `${'a'.repeat(294)}${emoji}tail`

  const extracted = extractText(10000, content, false)

  assert.equal([...extracted.text].length, 300)
  assert.equal(extracted.text.endsWith(emoji), true)
  assert.equal(extracted.text.includes('\uFFFD'), false)
})
