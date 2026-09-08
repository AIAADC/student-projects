import type { LibraryFile, LibraryManifest } from '../shared/contracts/index.js'

export type ExistingArchiveCopy = {
  archivePath: string
  sha256: string
}

export type ArchivePlanInput = {
  previousManifest?: LibraryManifest
  candidates: LibraryFile[]
  existingCopies: ExistingArchiveCopy[]
  generatedAt: string
  roots: string[]
  discovered: number
  duplicatesSkipped: number
}

export type ArchiveCopyOperation = {
  kind: 'copy-new'
  sourcePath: string
  archivePath: string
  modified: string
  sha256: string
}

export type ArchiveIntegrityIssue =
  | {
      kind: 'missing-previous-copy'
      archivePath: string
      expectedSha256: string
    }
  | {
      kind: 'changed-previous-copy' | 'target-conflict'
      archivePath: string
      expectedSha256: string
      actualSha256: string
    }

export type AppendOnlyArchivePlan = {
  manifest: LibraryManifest
  copyOperations: ArchiveCopyOperation[]
  reusedHashes: Array<{ sha256: string; archivePath: string; sourcePath: string }>
  reusedCopies: string[]
  integrityIssues: ArchiveIntegrityIssue[]
}

function normalizeArchivePath(archivePath: string) {
  return archivePath.replace(/\\/g, '/').replace(/^\.\//, '')
}

function pathKey(archivePath: string) {
  return normalizeArchivePath(archivePath).toLowerCase()
}

export function appendHash8(archivePath: string, sha256: string) {
  const normalized = normalizeArchivePath(archivePath)
  const slash = normalized.lastIndexOf('/')
  const dir = slash >= 0 ? normalized.slice(0, slash + 1) : ''
  const name = normalized.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  return `${dir}${stem}-${sha256.slice(0, 8)}${ext}`
}

export function planAppendOnlyArchive(input: ArchivePlanInput): AppendOnlyArchivePlan {
  const previousFiles = [...(input.previousManifest?.files ?? [])]
  const files = [...previousFiles]
  const copyOperations: ArchiveCopyOperation[] = []
  const reusedHashes: AppendOnlyArchivePlan['reusedHashes'] = []
  const reusedCopies: string[] = []
  const integrityIssues: ArchiveIntegrityIssue[] = []
  const existingByPath = new Map(input.existingCopies.map((copy) => [pathKey(copy.archivePath), copy.sha256]))
  const occupiedByPath = new Map(existingByPath)
  const manifestHashByPath = new Map<string, string>()
  const manifestFileByHash = new Map<string, LibraryFile>()

  for (const file of previousFiles) {
    const key = pathKey(file.archivePath)
    const actualHash = existingByPath.get(key)
    manifestHashByPath.set(key, file.sha256)
    if (!manifestFileByHash.has(file.sha256)) manifestFileByHash.set(file.sha256, file)
    if (actualHash === undefined) {
      integrityIssues.push({
        kind: 'missing-previous-copy',
        archivePath: file.archivePath,
        expectedSha256: file.sha256,
      })
      occupiedByPath.set(key, file.sha256)
    } else if (actualHash !== file.sha256) {
      integrityIssues.push({
        kind: 'changed-previous-copy',
        archivePath: file.archivePath,
        expectedSha256: file.sha256,
        actualSha256: actualHash,
      })
    }
  }

  let duplicateCount = input.duplicatesSkipped

  const targetState = (archivePath: string, sha256: string) => {
    const key = pathKey(archivePath)
    const reservedHash = manifestHashByPath.get(key)
    const actualHash = occupiedByPath.get(key)
    if (reservedHash !== undefined && reservedHash !== sha256) {
      return { state: 'conflict' as const, actualHash: actualHash ?? reservedHash }
    }
    if (actualHash === undefined) return { state: 'vacant' as const }
    if (actualHash === sha256) return { state: 'reusable' as const }
    return { state: 'conflict' as const, actualHash }
  }

  for (const candidate of input.candidates) {
    const recorded = manifestFileByHash.get(candidate.sha256)
    if (recorded) {
      duplicateCount += 1
      reusedHashes.push({
        sha256: candidate.sha256,
        archivePath: recorded.archivePath,
        sourcePath: candidate.sourcePath,
      })
      continue
    }

    const preferredPath = normalizeArchivePath(candidate.archivePath)
    const preferredState = targetState(preferredPath, candidate.sha256)
    const targetPath = preferredState.state === 'conflict' ? appendHash8(preferredPath, candidate.sha256) : preferredPath
    const state = preferredState.state === 'conflict' ? targetState(targetPath, candidate.sha256) : preferredState

    if (state.state === 'conflict') {
      duplicateCount += 1
      integrityIssues.push({
        kind: 'target-conflict',
        archivePath: targetPath,
        expectedSha256: candidate.sha256,
        actualSha256: state.actualHash,
      })
      continue
    }

    const name = targetPath.slice(targetPath.lastIndexOf('/') + 1)
    const archivedFile = { ...candidate, name, archivePath: targetPath }
    files.push(archivedFile)
    manifestFileByHash.set(candidate.sha256, archivedFile)
    manifestHashByPath.set(pathKey(targetPath), candidate.sha256)
    occupiedByPath.set(pathKey(targetPath), candidate.sha256)

    if (state.state === 'reusable') {
      reusedCopies.push(targetPath)
    } else {
      copyOperations.push({
        kind: 'copy-new',
        sourcePath: candidate.sourcePath,
        archivePath: targetPath,
        modified: candidate.modified,
        sha256: candidate.sha256,
      })
    }
  }

  const roots = [...(input.previousManifest?.roots ?? []), ...input.roots].filter(
    (root, index, all) => all.findIndex((item) => item.toLowerCase() === root.toLowerCase()) === index,
  )
  const sortedFiles = files.sort(
    (left, right) =>
      left.category.localeCompare(right.category, 'zh-CN') || left.name.localeCompare(right.name, 'zh-CN'),
  )

  return {
    manifest: {
      generatedAt: input.generatedAt,
      roots,
      files: sortedFiles,
      stats: {
        discovered: input.discovered,
        archived: sortedFiles.length,
        duplicatesSkipped: duplicateCount,
        bytes: sortedFiles.reduce((sum, file) => sum + file.size, 0),
      },
    },
    copyOperations,
    reusedHashes,
    reusedCopies,
    integrityIssues,
  }
}
