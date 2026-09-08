import assert from 'node:assert/strict'
import test from 'node:test'
import type { LibraryFile, LibraryManifest } from '../shared/contracts/index.js'
import { planAppendOnlyArchive } from './archivePlan.js'

const oldHash = 'a'.repeat(64)

function libraryFile(overrides: Partial<LibraryFile> = {}): LibraryFile {
  return {
    id: oldHash.slice(0, 20),
    name: '旧资料.pdf',
    ext: '.pdf',
    mime: 'application/pdf',
    size: 12,
    modified: '2026-01-01T00:00:00.000Z',
    category: '学业',
    subcategory: ['文档', 'PDF'],
    archivePath: 'archive/学业/文档/PDF/旧资料.pdf',
    sourcePath: 'D:/微信文件/旧资料.pdf',
    sourceApp: '微信',
    preview: 'pdf',
    sha256: oldHash,
    ...overrides,
  }
}

function manifest(files: LibraryFile[]): LibraryManifest {
  return {
    generatedAt: '2026-01-01T00:00:00.000Z',
    roots: ['D:/微信文件'],
    files,
    stats: {
      discovered: files.length,
      archived: files.length,
      duplicatesSkipped: 0,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  }
}

const run = (
  previousManifest: LibraryManifest | undefined,
  candidates: LibraryFile[],
  existingCopies: Array<{ archivePath: string; sha256: string }>,
) =>
  planAppendOnlyArchive({
    previousManifest,
    candidates,
    existingCopies,
    generatedAt: '2026-07-12T12:00:00.000Z',
    roots: ['D:/微信文件'],
    discovered: candidates.length,
    duplicatesSkipped: 0,
  })

test('retains every previous manifest entry without planning destructive operations', () => {
  const previousFile = libraryFile()
  const previous = manifest([previousFile])

  const plan = run(previous, [], [{ archivePath: previousFile.archivePath, sha256: previousFile.sha256 }])

  assert.deepEqual(plan.manifest.files, [previousFile])
  assert.deepEqual(plan.copyOperations, [])
  assert.equal('deleteOperations' in plan, false)
  assert.deepEqual(previous, manifest([previousFile]))
})

test('reuses a hash already recorded in the previous manifest', () => {
  const previousFile = libraryFile()
  const duplicate = libraryFile({
    name: '另一个名字.pdf',
    archivePath: 'archive/学业/文档/PDF/另一个名字.pdf',
    sourcePath: 'D:/微信文件/另一个名字.pdf',
  })

  const plan = run(manifest([previousFile]), [duplicate], [
    { archivePath: previousFile.archivePath, sha256: previousFile.sha256 },
  ])

  assert.deepEqual(plan.manifest.files, [previousFile])
  assert.deepEqual(plan.copyOperations, [])
  assert.deepEqual(plan.reusedHashes, [
    { sha256: oldHash, archivePath: previousFile.archivePath, sourcePath: duplicate.sourcePath },
  ])
})

test('plans an exclusive copy for a hash not present in the manifest or archive', () => {
  const newHash = '1'.repeat(64)
  const candidate = libraryFile({
    id: newHash.slice(0, 20),
    sha256: newHash,
    name: '新资料.pdf',
    archivePath: 'archive/学业/文档/PDF/新资料.pdf',
    sourcePath: 'D:/微信文件/新资料.pdf',
  })

  const plan = run(undefined, [candidate], [])

  assert.deepEqual(plan.copyOperations, [
    {
      kind: 'copy-new',
      sourcePath: candidate.sourcePath,
      archivePath: candidate.archivePath,
      modified: candidate.modified,
      sha256: candidate.sha256,
    },
  ])
  assert.deepEqual(plan.manifest.files, [candidate])
})

test('reuses an untracked archive copy when its hash matches the candidate', () => {
  const candidate = libraryFile()

  const plan = run(undefined, [candidate], [
    { archivePath: candidate.archivePath, sha256: candidate.sha256 },
  ])

  assert.deepEqual(plan.copyOperations, [])
  assert.deepEqual(plan.manifest.files, [candidate])
  assert.deepEqual(plan.reusedCopies, [candidate.archivePath])
})

test('adds hash8 to a new file instead of overwriting different content with the same name', () => {
  const newHash = `12345678${'b'.repeat(56)}`
  const candidate = libraryFile({
    id: newHash.slice(0, 20),
    sha256: newHash,
    name: '同名资料.pdf',
    archivePath: 'archive/学业/文档/PDF/同名资料.pdf',
    sourcePath: 'D:/微信文件/同名资料.pdf',
  })

  const plan = run(undefined, [candidate], [
    { archivePath: candidate.archivePath, sha256: 'f'.repeat(64) },
  ])

  assert.equal(plan.copyOperations[0]?.archivePath, 'archive/学业/文档/PDF/同名资料-12345678.pdf')
  assert.equal(plan.manifest.files[0]?.name, '同名资料-12345678.pdf')
  assert.equal(plan.manifest.files[0]?.archivePath, 'archive/学业/文档/PDF/同名资料-12345678.pdf')
})

test('reports a missing previous copy without dropping or recreating its manifest entry', () => {
  const previousFile = libraryFile()
  const sourceStillAvailable = libraryFile({ sourcePath: 'D:/微信文件/仍存在的源文件.pdf' })

  const plan = run(manifest([previousFile]), [sourceStillAvailable], [])

  assert.deepEqual(plan.manifest.files, [previousFile])
  assert.deepEqual(plan.copyOperations, [])
  assert.deepEqual(plan.integrityIssues, [
    {
      kind: 'missing-previous-copy',
      archivePath: previousFile.archivePath,
      expectedSha256: previousFile.sha256,
    },
  ])
})

test('reports a hash8 target conflict instead of overwriting either existing copy', () => {
  const newHash = `12345678${'c'.repeat(56)}`
  const candidate = libraryFile({
    id: newHash.slice(0, 20),
    sha256: newHash,
    name: '冲突.pdf',
    archivePath: 'archive/学业/文档/PDF/冲突.pdf',
    sourcePath: 'D:/微信文件/冲突.pdf',
  })
  const hash8Path = 'archive/学业/文档/PDF/冲突-12345678.pdf'

  const plan = run(undefined, [candidate], [
    { archivePath: candidate.archivePath, sha256: 'd'.repeat(64) },
    { archivePath: hash8Path, sha256: 'e'.repeat(64) },
  ])

  assert.deepEqual(plan.copyOperations, [])
  assert.deepEqual(plan.manifest.files, [])
  assert.deepEqual(plan.integrityIssues, [
    {
      kind: 'target-conflict',
      archivePath: hash8Path,
      expectedSha256: newHash,
      actualSha256: 'e'.repeat(64),
    },
  ])
})
