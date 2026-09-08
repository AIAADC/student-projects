import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { LibraryManifest } from '../shared/contracts/index.js'
import type { ArchiveIntegrityIssue } from './archivePlan.js'
import type { ArchiveSourceIssue } from './archiveSources.js'
import { validateLibraryManifest } from './libraryManifestValidation.js'
import { sha256File } from './shared.js'
import { readCurrentLibraryManifest, resolveCurrentProductEntrypoint } from './data/catalogConsumer.js'

export { validateLibraryManifest } from './libraryManifestValidation.js'

export type LibraryManifestSource = 'current' | 'legacy' | 'none'

export type LibraryBundleReceiptInput = {
  generatedAt: string
  previousSource: LibraryManifestSource
  previousManifestSha256?: string
  plannedCopies: number
  completedCopies: number
  reusedHashes: number
  reusedCopies: number
  sourceIssues: ArchiveSourceIssue[]
  integrityIssues: ArchiveIntegrityIssue[]
}

export type LibraryBundleReceipt = LibraryBundleReceiptInput & {
  formatVersion: 1
  bundle: 'library.next'
  runId: string
  manifestFile: 'manifest.json'
  manifestSha256: string
}

export type LibraryManifestResolution = {
  source: LibraryManifestSource
  selectedPath: string | null
  currentPath: string
  legacyPath: string
  manifest?: LibraryManifest
  manifestSha256?: string
}

export type StagedLibraryBundle = {
  stagingDirectory: string
  manifestPath: string
  receiptPath: string
  expectedManifestSha256: string
}

type PublishLibraryBundleInput = {
  dataDirectory: string
  runId: string
  manifest: LibraryManifest
  receipt: LibraryBundleReceiptInput
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function assertSafeDirectory(candidate: string) {
  const stat = fs.lstatSync(candidate)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe directory: ${candidate}`)
  return fs.realpathSync(candidate)
}

function assertContained(baseRealPath: string, candidateRealPath: string) {
  const relative = path.relative(baseRealPath, candidateRealPath)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Library path escapes its data directory')
  }
}

function readStrictJsonFile(filePath: string, containedBy: string) {
  const stat = fs.lstatSync(filePath)
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Library manifest path is not a regular file')
  assertContained(containedBy, fs.realpathSync(filePath))
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filePath))
  } catch {
    throw new Error('Library JSON must be valid UTF-8')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error('Library JSON is malformed')
  }
}

function manifestJson(manifest: LibraryManifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

function jsonSha256(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function validateReceiptInput(receipt: LibraryBundleReceiptInput, manifest: LibraryManifest) {
  if (receipt.generatedAt !== manifest.generatedAt || Number.isNaN(Date.parse(receipt.generatedAt))) {
    throw new Error('Library receipt timestamp does not match its manifest')
  }
  if (!new Set<LibraryManifestSource>(['current', 'legacy', 'none']).has(receipt.previousSource)) {
    throw new Error('Library receipt previous source is invalid')
  }
  for (const value of [
    receipt.plannedCopies,
    receipt.completedCopies,
    receipt.reusedHashes,
    receipt.reusedCopies,
  ]) {
    if (!isNonNegativeInteger(value)) throw new Error('Library receipt counters are invalid')
  }
  if (receipt.completedCopies !== receipt.plannedCopies) {
    throw new Error('Library receipt cannot publish an incomplete copy plan')
  }
  if (!Array.isArray(receipt.sourceIssues) || !Array.isArray(receipt.integrityIssues)) {
    throw new Error('Library receipt issues are invalid')
  }
  if (receipt.previousManifestSha256 !== undefined && !/^[a-f0-9]{64}$/.test(receipt.previousManifestSha256)) {
    throw new Error('Library receipt previous manifest hash is invalid')
  }
}

function writeExclusive(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
}

async function validateStagedLibraryBundle(bundle: StagedLibraryBundle) {
  const stagingRealPath = assertSafeDirectory(bundle.stagingDirectory)
  const manifest = validateLibraryManifest(readStrictJsonFile(bundle.manifestPath, stagingRealPath))
  const receiptValue = readStrictJsonFile(bundle.receiptPath, stagingRealPath)
  if (!isRecord(receiptValue)) throw new Error('Library receipt is invalid')
  const actualManifestSha256 = await sha256File(bundle.manifestPath)
  if (
    actualManifestSha256 !== bundle.expectedManifestSha256 ||
    receiptValue.manifestSha256 !== actualManifestSha256 ||
    receiptValue.generatedAt !== manifest.generatedAt ||
    receiptValue.formatVersion !== 1 ||
    receiptValue.bundle !== 'library.next' ||
    receiptValue.manifestFile !== 'manifest.json'
  ) {
    throw new Error('Staged library bundle failed validation')
  }
}

export async function publishLibraryNextBundle(
  input: PublishLibraryBundleInput,
  additionalValidation?: (bundle: StagedLibraryBundle) => void | Promise<void>,
) {
  if (!/^[0-9A-Za-z._-]+$/.test(input.runId)) throw new Error('Library run id contains unsafe path characters')
  const manifest = validateLibraryManifest(input.manifest)
  validateReceiptInput(input.receipt, manifest)
  const dataDirectory = path.resolve(input.dataDirectory)
  const dataRealPath = assertSafeDirectory(dataDirectory)
  const finalDirectory = path.join(dataDirectory, 'library.next')
  const stagingDirectory = path.join(dataDirectory, `.library.next.${input.runId}.staging`)
  assertContained(dataRealPath, path.resolve(finalDirectory))
  assertContained(dataRealPath, path.resolve(stagingDirectory))
  if (fs.existsSync(finalDirectory)) throw new Error(`Library final bundle already exists: ${finalDirectory}`)
  if (fs.existsSync(stagingDirectory)) throw new Error(`Library staging bundle already exists: ${stagingDirectory}`)

  const serializedManifest = manifestJson(manifest)
  const manifestSha256 = jsonSha256(serializedManifest)
  const receipt: LibraryBundleReceipt = {
    ...input.receipt,
    formatVersion: 1,
    bundle: 'library.next',
    runId: input.runId,
    manifestFile: 'manifest.json',
    manifestSha256,
  }
  fs.mkdirSync(stagingDirectory)
  const manifestPath = path.join(stagingDirectory, 'manifest.json')
  const receiptPath = path.join(stagingDirectory, 'receipt.json')
  fs.writeFileSync(manifestPath, serializedManifest, { encoding: 'utf8', flag: 'wx' })
  writeExclusive(receiptPath, receipt)
  const staged = { stagingDirectory, manifestPath, receiptPath, expectedManifestSha256: manifestSha256 }
  await validateStagedLibraryBundle(staged)
  await additionalValidation?.(staged)
  if (fs.existsSync(finalDirectory)) throw new Error(`Library final bundle already exists: ${finalDirectory}`)
  fs.renameSync(stagingDirectory, finalDirectory)
  return { finalDirectory, manifestPath: path.join(finalDirectory, 'manifest.json'), receipt }
}

export function readLibraryManifestForArchive(dataDirectoryInput: string): LibraryManifestResolution {
  const dataDirectory = path.resolve(dataDirectoryInput)
  const projectRoot = path.dirname(dataDirectory)
  const currentPath = resolveCurrentProductEntrypoint(dataDirectory, 'library', 'manifest')
  const legacyPath = path.join(dataDirectory, 'library.json')
  const manifest = readCurrentLibraryManifest(projectRoot)
  return {
    source: 'current',selectedPath: currentPath,currentPath,legacyPath,manifest,
    manifestSha256: jsonSha256(manifestJson(manifest)),
  }
}
