import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createResourceFileIndex,
  matchResourceFile,
  type ResourceFileCandidate,
} from './resourceFileMatcher.js'

const candidates: ResourceFileCandidate[] = [
  {
    relativePath: 'msg\\attach\\room\\2026-07\\Img\\41dc6069a2c1d5a8757704fc3dea0701.dat',
    name: '41dc6069a2c1d5a8757704fc3dea0701.dat',
    size: 2048,
  },
  {
    relativePath: 'msg\\attach\\room\\2026-07\\Img\\41dc6069a2c1d5a8757704fc3dea0701_t.dat',
    name: '41dc6069a2c1d5a8757704fc3dea0701_t.dat',
    size: 512,
  },
  {
    relativePath: 'msg\\file\\2026-07\\课程讲义.pdf',
    name: '课程讲义.pdf',
    size: 4096,
  },
  {
    relativePath: 'msg\\attach\\room\\2026-07\\0\\课程讲义.pdf',
    name: '课程讲义.pdf',
    size: 8192,
  },
]

test('uses packed-info lookup evidence and exact size to select one local file', () => {
  const index = createResourceFileIndex(candidates)

  assert.deepEqual(matchResourceFile(index, {
    lookupEvidence: ['41DC6069A2C1D5A8757704FC3DEA0701'],
    filenames: [],
    expectedSize: 2048,
  }), {
    status: 'lookup_exact',
    candidate: candidates[0],
    candidates: [candidates[0]],
  })
})

test('keeps lookup variants ambiguous when no stable discriminator selects one', () => {
  const index = createResourceFileIndex(candidates)
  const result = matchResourceFile(index, {
    lookupEvidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
    filenames: [],
    expectedSize: 0,
  })

  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.candidates.map((item) => item.relativePath), [
    candidates[0]?.relativePath,
    candidates[1]?.relativePath,
  ])
})

test('labels a unique exact filename as unconfirmed filename-only evidence', () => {
  const index = createResourceFileIndex(candidates)

  assert.deepEqual(matchResourceFile(index, {
    lookupEvidence: [],
    filenames: ['课程讲义.pdf'],
    expectedSize: 4096,
  }), {
    status: 'filename_only',
    candidate: candidates[2],
    candidates: [candidates[2]],
  })
})

test('returns missing without falling back to partial or stem matches', () => {
  const index = createResourceFileIndex(candidates)

  assert.deepEqual(matchResourceFile(index, {
    lookupEvidence: [],
    filenames: ['讲义.pdf'],
    expectedSize: 0,
  }), {
    status: 'missing',
    candidate: null,
    candidates: [],
  })
})
