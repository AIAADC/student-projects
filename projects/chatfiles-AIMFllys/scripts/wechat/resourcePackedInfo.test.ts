import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePackedInfoEvidence } from './resourcePackedInfo.js'

function varint(value: number) {
  const bytes: number[] = []
  let remaining = value >>> 0
  do {
    const next = remaining & 0x7f
    remaining >>>= 7
    bytes.push(next | (remaining > 0 ? 0x80 : 0))
  } while (remaining > 0)
  return Buffer.from(bytes)
}

function bytesField(field: number, value: Uint8Array | string) {
  const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value)
  return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
}

test('extracts nested lookup evidence and Unicode filenames from protobuf evidence', () => {
  const lookupEvidence = '41dc6069a2c1d5a8757704fc3dea0701'
  const messageInfo = bytesField(2, bytesField(1, lookupEvidence))
  const fileName = '网站设计审美资料_64个网站整理.pdf'
  const detailInfo = bytesField(1, Buffer.concat([
    bytesField(1, fileName),
    bytesField(2, fileName),
  ]))

  assert.deepEqual(parsePackedInfoEvidence(messageInfo), {
    valid: true,
    strings: [lookupEvidence],
    lookupEvidence: [lookupEvidence],
    filenames: [],
  })
  assert.deepEqual(parsePackedInfoEvidence(detailInfo), {
    valid: true,
    strings: [fileName],
    lookupEvidence: [],
    filenames: [fileName],
  })
})

test('deduplicates evidence in stable traversal order', () => {
  const name = '技能工具.skill.md'
  const packed = Buffer.concat([
    bytesField(1, name),
    bytesField(2, bytesField(1, name)),
    bytesField(3, name),
  ])

  assert.deepEqual(parsePackedInfoEvidence(packed), {
    valid: true,
    strings: [name],
    lookupEvidence: [],
    filenames: [name],
  })
})

test('reports malformed wire data without returning partial attacker evidence', () => {
  const malformed = Buffer.from([0x0a, 0x08, 0x66, 0x6f, 0x6f])

  assert.deepEqual(parsePackedInfoEvidence(malformed), {
    valid: false,
    strings: [],
    lookupEvidence: [],
    filenames: [],
  })
})

test('accepts empty packed info and ignores non-UTF8 length-delimited fields', () => {
  assert.deepEqual(parsePackedInfoEvidence(Buffer.alloc(0)), {
    valid: true,
    strings: [],
    lookupEvidence: [],
    filenames: [],
  })
  assert.deepEqual(parsePackedInfoEvidence(bytesField(1, Buffer.from([0xff, 0xfe]))), {
    valid: true,
    strings: [],
    lookupEvidence: [],
    filenames: [],
  })
})
