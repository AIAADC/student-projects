import fs from 'node:fs'
import path from 'node:path'
import type { LibraryFile } from '../shared/contracts/index.js'
import { appendHash8, planAppendOnlyArchive } from './archivePlan.js'
import type { ArchiveSourceIssue } from './archiveSources.js'
import {
  ensureContainedDirectory,
  resolveContainedExistingFile,
  resolveContainedWriteTarget,
} from './containedPaths.js'
import { publishLibraryNextBundle, readLibraryManifestForArchive } from './libraryBundle.js'
import { classify, duplicateStem, mimeFor, previewFor, safeName, sha256File, sourceApp } from './shared.js'

export type ArchiveRefreshOptions = {
  projectRoot: string
  sourceRoots: string[]
  sourceIssues: ArchiveSourceIssue[]
  runId: string
  generatedAt: string
}

type DiscoveredSourceFile = {
  filePath: string
  sourceRoot: string
}

const syncableExt =
  /\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|zip|rar|7z|py|ipynb|cpp|c|h|java|js|ts|tsx|html?|css|png|jpe?g|gif|webp|bmp|svg|ico|apng|avif|heic|heif|mp4|mov|mkv|webm|avi|m4v|3gp|mp3|wav|ogg|m4a|aac|flac|wma|silk|amr)$/i
const syncNoisePath =
  /\\(avatar|Emoji|baseemojisyastems|emoji-recv|emojirecv|emojirelated|OnlineStatus|log-cache|logs?|xlog|cache|CacheStorage|Code Cache|Service Worker|Local Storage|Session Storage|IndexedDB|leveldb|blob_storage|Crashpad|GPUCache|DawnGraphiteCache|DawnWebGPUCache|dictionaries|DynamicResource|DynamicResourcePackage|dynamic_module|dynamic_package|packages|patch|upgrade|xplugin|XPlugin|xworker|publicLib|tbs|themes?|locales?|resources?|node_modules|miniapp\\temps|arks|qqex|shared dictionary)\\/i
const syncNoiseFile = /\.(log|xlog|qqxlog|dat|db|db-shm|db-wal|ldb|sst|tmp|bak|ini|map|dmp|pak|bin|dll|exe)$/i

function isContained(base: string, candidate: string) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function assertSafeSourceRoot(sourceRoot: string) {
  const resolved = path.resolve(sourceRoot)
  const stat = fs.lstatSync(resolved)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe archive source root: ${resolved}`)
  return fs.realpathSync(resolved)
}

function walkSourceRoot(sourceRoot: string, sourceIssues: ArchiveSourceIssue[]) {
  const rootRealPath = assertSafeSourceRoot(sourceRoot)
  const files: DiscoveredSourceFile[] = []

  const visit = (directory: string) => {
    const directoryStat = fs.lstatSync(directory)
    if (directoryStat.isSymbolicLink()) {
      sourceIssues.push({ kind: 'unsafe-symlink', candidate: directory })
      return
    }
    const directoryRealPath = fs.realpathSync(directory)
    if (!directoryStat.isDirectory() || !isContained(rootRealPath, directoryRealPath)) {
      sourceIssues.push({ kind: 'outside-configured-root', candidate: directory })
      return
    }

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name)
      const stat = fs.lstatSync(candidate)
      if (stat.isSymbolicLink()) {
        sourceIssues.push({ kind: 'unsafe-symlink', candidate })
        continue
      }
      const realPath = fs.realpathSync(candidate)
      if (!isContained(rootRealPath, realPath)) {
        sourceIssues.push({ kind: 'outside-configured-root', candidate })
        continue
      }
      if (stat.isDirectory()) visit(candidate)
      else if (stat.isFile()) files.push({ filePath: realPath, sourceRoot: rootRealPath })
    }
  }

  visit(rootRealPath)
  return files
}

function chooseLatestSerial(files: DiscoveredSourceFile[]) {
  const byName = new Map<string, DiscoveredSourceFile>()
  const serials = new Map<string, number>()
  for (const file of files) {
    const { key, serial } = duplicateStem(path.basename(file.filePath))
    const scopedKey = `${path.dirname(file.filePath).toLowerCase()}\\${key}`
    const previous = serials.get(scopedKey) ?? -1
    if (serial >= previous) {
      byName.set(scopedKey, file)
      serials.set(scopedKey, serial)
    }
  }
  return [...byName.values()]
}

function isSyncableChatAsset(filePath: string) {
  if (!syncableExt.test(filePath) || syncNoisePath.test(filePath) || syncNoiseFile.test(filePath)) return false
  const preview = previewFor(filePath)
  return preview !== 'download' && preview !== 'font' && preview !== 'database'
}

function assertFreshBundleDestination(dataDirectory: string, runId: string) {
  if (!/^[0-9A-Za-z._-]+$/.test(runId)) throw new Error('Library run id contains unsafe path characters')
  const finalDirectory = path.join(dataDirectory, 'library.next')
  const stagingDirectory = path.join(dataDirectory, `.library.next.${runId}.staging`)
  if (fs.existsSync(finalDirectory)) throw new Error(`Library final bundle already exists: ${finalDirectory}`)
  if (fs.existsSync(stagingDirectory)) throw new Error(`Library staging bundle already exists: ${stagingDirectory}`)
}

function assertSourceFile(filePath: string, sourceRoot: string) {
  const source = path.resolve(filePath)
  const rootRealPath = assertSafeSourceRoot(sourceRoot)
  const stat = fs.lstatSync(source)
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Unsafe archive source file: ${source}`)
  const realPath = fs.realpathSync(source)
  if (!isContained(rootRealPath, realPath)) throw new Error(`Archive source escaped its root: ${source}`)
  return realPath
}

export async function runArchiveRefresh(options: ArchiveRefreshOptions) {
  const projectRoot = path.resolve(options.projectRoot)
  const projectStat = fs.lstatSync(projectRoot)
  if (projectStat.isSymbolicLink() || !projectStat.isDirectory()) throw new Error('Project root must be a regular directory')
  const dataDirectory = path.join(projectRoot, 'data')
  const archiveDirectory = path.join(projectRoot, 'archive')
  ensureContainedDirectory(projectRoot, dataDirectory)
  ensureContainedDirectory(projectRoot, archiveDirectory)
  assertFreshBundleDestination(dataDirectory, options.runId)
  const previous = readLibraryManifestForArchive(dataDirectory)
  const sourceIssues = [...options.sourceIssues]
  const sourceRoots = options.sourceRoots.map((sourceRoot) => assertSafeSourceRoot(sourceRoot))
  const discovered = sourceRoots.flatMap((sourceRoot) => walkSourceRoot(sourceRoot, sourceIssues))
  const eligible = chooseLatestSerial(discovered.filter((file) => isSyncableChatAsset(file.filePath)))
  const sourceRootByFile = new Map(eligible.map((file) => [file.filePath.toLowerCase(), file.sourceRoot]))
  const candidates: LibraryFile[] = []

  for (const source of eligible) {
    const stat = fs.statSync(source.filePath)
    if (stat.size === 0) continue
    const sha256 = await sha256File(source.filePath)
    const { category, subcategory } = classify(source.filePath)
    const ext = path.extname(source.filePath).toLowerCase()
    const name = safeName(path.basename(source.filePath))
    const preferredDestination = path.join(archiveDirectory, category, ...subcategory, name)
    candidates.push({
      id: sha256.slice(0, 20),
      name,
      ext,
      mime: mimeFor(preferredDestination),
      size: stat.size,
      modified: stat.mtime.toISOString(),
      category,
      subcategory,
      archivePath: path.relative(projectRoot, preferredDestination).replace(/\\/g, '/'),
      sourcePath: source.filePath,
      sourceApp: sourceApp(source.filePath),
      preview: previewFor(preferredDestination),
      sha256,
    })
  }

  const pathsToInspect = new Set(previous.manifest?.files.map((file) => file.archivePath) ?? [])
  for (const candidate of candidates) {
    pathsToInspect.add(candidate.archivePath)
    pathsToInspect.add(appendHash8(candidate.archivePath, candidate.sha256))
  }

  const existingCopies: Array<{ archivePath: string; sha256: string }> = []
  for (const archivePath of pathsToInspect) {
    const target = resolveContainedWriteTarget(archiveDirectory, path.resolve(projectRoot, archivePath))
    if (!fs.existsSync(target)) continue
    const existingFile = resolveContainedExistingFile(archiveDirectory, target)
    existingCopies.push({ archivePath, sha256: await sha256File(existingFile) })
  }

  const plan = planAppendOnlyArchive({
    previousManifest: previous.manifest,
    candidates,
    existingCopies,
    generatedAt: options.generatedAt,
    roots: sourceRoots,
    discovered: discovered.length,
    duplicatesSkipped: discovered.length - eligible.length,
  })

  let completedCopies = 0
  for (const operation of plan.copyOperations) {
    const sourceRoot = sourceRootByFile.get(path.resolve(operation.sourcePath).toLowerCase())
    if (!sourceRoot) throw new Error(`Archive copy source was not discovered safely: ${operation.sourcePath}`)
    const source = assertSourceFile(operation.sourcePath, sourceRoot)
    const target = resolveContainedWriteTarget(archiveDirectory, path.resolve(projectRoot, operation.archivePath))
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL)
    const copiedFile = resolveContainedExistingFile(archiveDirectory, target)
    const copiedSha256 = await sha256File(copiedFile)
    if (copiedSha256 !== operation.sha256) throw new Error(`Archived copy failed SHA-256 verification: ${operation.archivePath}`)
    const modified = new Date(operation.modified)
    fs.utimesSync(copiedFile, modified, modified)
    completedCopies += 1
  }

  const previousManifestSha256 = previous.selectedPath ? await sha256File(previous.selectedPath) : undefined
  const bundle = await publishLibraryNextBundle({
    dataDirectory,
    runId: options.runId,
    manifest: plan.manifest,
    receipt: {
      generatedAt: options.generatedAt,
      previousSource: previous.source,
      previousManifestSha256,
      plannedCopies: plan.copyOperations.length,
      completedCopies,
      reusedHashes: plan.reusedHashes.length,
      reusedCopies: plan.reusedCopies.length,
      sourceIssues,
      integrityIssues: plan.integrityIssues,
    },
  })

  return { bundle, plan, sourceRoots, sourceIssues, discovered: discovered.length, eligible: eligible.length }
}
