import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import mime from 'mime'
import type { DeepFileIndex, LibraryManifest, SourceFileManifest } from '../../shared/contracts/index.js'
import { sourceFileManifestSchema } from '../../shared/contracts/index.js'
import { readJsonSource } from '../../shared/json.js'
import { readActiveProductSet } from '../data/catalogReader.js'
import { readCatalogLibrary } from '../data/productReaders.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const root = path.resolve(__dirname, '..', '..')
export const audioCacheDir = path.join(root, 'work', 'audio-cache')

export function readJson<T>(filePath: string, fallback: T): T {
  return readJsonSource(() => fs.readFileSync(filePath, 'utf8'), fallback)
}

export function library(projectRoot = root): LibraryManifest {
  return readCatalogLibrary(readActiveProductSet(projectRoot))
}

export function sourceLibrary(projectRoot = root): SourceFileManifest {
  const deepIndex = readJson<DeepFileIndex>(path.join(projectRoot, 'data', 'deep-index.json'), {
    generatedAt: new Date(0).toISOString(),
    roots: [],
    totals: {
      files: 0,
      directories: 0,
      bytes: 0,
      databaseCandidates: 0,
      textCandidates: 0,
      mediaCandidates: 0,
      attachmentCandidates: 0,
    },
    extensionStats: [],
    databaseCandidates: [],
    largestFiles: [],
    newestFiles: [],
    files: [],
  })
  const files = (deepIndex.files ?? []).map((item) => ({
    id: crypto.createHash('sha1').update(item.path).digest('hex').slice(0, 20),
    name: path.basename(item.path) || item.relativePath || item.path,
    ext: item.ext,
    mime: mime.getType(item.path) ?? 'application/octet-stream',
    size: item.size,
    modified: item.modified,
    root: item.root,
    relativePath: item.relativePath,
    sourcePath: item.path,
    sourceApp: item.sourceApp,
    preview: item.preview,
  }))
  return sourceFileManifestSchema.parse({
    generatedAt: deepIndex.generatedAt,
    roots: deepIndex.roots.filter((item) => item.exists).map((item) => item.path),
    files,
    stats: {
      files: deepIndex.totals.files,
      bytes: deepIndex.totals.bytes,
      databaseCandidates: deepIndex.totals.databaseCandidates,
      mediaCandidates: deepIndex.totals.mediaCandidates,
      textCandidates: deepIndex.totals.textCandidates,
    },
  })
}

export function printableAscii(buffer: Buffer) {
  return [...buffer].map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')).join('')
}
