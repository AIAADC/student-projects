import { createHash } from 'node:crypto'
import type { SearchChunk, SearchMessage } from './searchTypes.js'

const DEFAULT_MIN = 500
const DEFAULT_MAX = 800
const DEFAULT_OVERLAP = 80

function pointWeight(point: string) {
  return /[\p{Script=Han}\p{Extended_Pictographic}]/u.test(point) ? 1 : 0.25
}

export function estimateSearchTokens(text: string) {
  let weight = 0
  for (const point of text) weight += pointWeight(point)
  return Math.ceil(weight)
}

function splitText(text: string, maximum: number) {
  const parts: string[] = []
  let current = ''
  let weight = 0
  for (const point of text) {
    const next = pointWeight(point)
    if (current && Math.ceil(weight + next) > maximum) {
      parts.push(current)
      current = ''
      weight = 0
    }
    current += point
    weight += next
  }
  if (current) parts.push(current)
  return parts
}

export function chineseNgrams(text: string) {
  const terms: string[] = []
  for (const match of text.matchAll(/\p{Script=Han}+/gu)) {
    const points = [...match[0]]
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= points.length; index += 1) {
        terms.push(points.slice(index, index + size).join(''))
      }
    }
  }
  for (const match of text.matchAll(/[a-z0-9_:@.-]+/giu)) terms.push(match[0].toLowerCase())
  return [...new Set(terms)].join(' ')
}

type Unit = SearchMessage & { tokenCount: number }

function unitsFor(messages: readonly SearchMessage[], maximum: number, overlap: number) {
  const units: Unit[] = []
  for (const message of messages) {
    const clean = message.text.trim()
    if (!clean) continue
    for (const text of splitText(clean, maximum - overlap)) {
      units.push({ ...message, text, tokenCount: estimateSearchTokens(text) })
    }
  }
  return units
}

function tailForOverlap(units: readonly Unit[], target: number) {
  const tail: Unit[] = []
  let remaining = target
  for (let index = units.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const unit = units[index]
    if (unit.tokenCount <= remaining) {
      tail.unshift(unit)
      remaining -= unit.tokenCount
      continue
    }
    const points = [...unit.text]
    let cut = points.length
    let weight = 0
    while (cut > 0 && Math.ceil(weight) < remaining) {
      cut -= 1
      weight += pointWeight(points[cut])
    }
    const text = points.slice(cut).join('')
    tail.unshift({ ...unit, text, tokenCount: estimateSearchTokens(text) })
    remaining = 0
  }
  return tail
}

function makeChunk(units: readonly Unit[], index: number): SearchChunk {
  const first = units[0]
  const last = units[units.length - 1]
  const text = units.map((unit) => `${unit.senderName || unit.sender}: ${unit.text}`).join('\n')
  const identity = `${first.conversationId}\n${first.messageUid}\n${last.messageUid}\n${index}\n${text}`
  return {
    chunkId: createHash('sha256').update(identity, 'utf8').digest('hex'),
    conversationId: first.conversationId,
    firstMessageUid: first.messageUid,
    lastMessageUid: last.messageUid,
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    startTime: first.time,
    endTime: last.time,
    senderIds: [...new Set(units.map((unit) => unit.sender).filter(Boolean))],
    text,
    ngrams: chineseNgrams(text),
    tokenCount: units.reduce((total, unit) => total + unit.tokenCount, 0),
  }
}

export function chunkMessages(
  messages: readonly SearchMessage[],
  options: { minimumTokens?: number; maximumTokens?: number; overlapTokens?: number } = {},
) {
  const chunker = createMessageChunker(options)
  const chunks: SearchChunk[] = []
  for (const message of messages) chunks.push(...chunker.push(message))
  chunks.push(...chunker.finish())
  return chunks
}

export function createMessageChunker(
  options: { minimumTokens?: number; maximumTokens?: number; overlapTokens?: number } = {},
) {
  const minimum = options.minimumTokens ?? DEFAULT_MIN
  const maximum = options.maximumTokens ?? DEFAULT_MAX
  const overlap = Math.min(options.overlapTokens ?? DEFAULT_OVERLAP, maximum - 1)
  let current: Unit[] = []
  let tokens = 0
  let index = 0
  let dirty = false
  const emit = () => {
    const chunk = makeChunk(current, index)
    index += 1
    current = tailForOverlap(current, overlap)
    tokens = current.reduce((total, item) => total + item.tokenCount, 0)
    dirty = false
    return chunk
  }
  return {
    push(message: SearchMessage) {
      const chunks: SearchChunk[] = []
      for (const unit of unitsFor([message], maximum, overlap)) {
        if (current.length && tokens + unit.tokenCount > maximum) chunks.push(emit())
        current.push(unit)
        tokens += unit.tokenCount
        dirty = true
        if (tokens >= minimum && tokens === maximum) chunks.push(emit())
      }
      return chunks
    },
    finish() {
      if (!current.length || !dirty) return []
      const chunk = makeChunk(current, index)
      current = tailForOverlap(current, overlap)
      tokens = current.reduce((total, item) => total + item.tokenCount, 0)
      index += 1
      dirty = false
      return [chunk]
    },
  }
}
