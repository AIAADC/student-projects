import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

import { loadLocalEnv, type LocalEnvironment } from '../../scripts/localEnv.js'
import type { ChatArtifactAvailability } from '../../shared/contracts/chat.js'
import { root } from '../utils/helpers.js'
import { inspectArtifactStorage } from './artifactStorageShape.js'
import { artifactAvailabilityFor } from './artifactAvailability.js'
import { resolveArtifactFile } from './artifactFileResolution.js'

export type ArtifactSourcePurpose = 'content' | 'thumbnail'

export type ArtifactSourceAsset = {
  id: string
  conversationId: string | null
  category: 'work' | 'document' | 'skill' | 'link'
  kind: string
  name: string
  preview: string
  url: string | null
  createdAt: number
  senderName: string
  size: number | null
  materialization: string
  previewStatus: string
  associationStatus: 'exact' | 'partial' | 'conflict' | 'missing' | 'legacy'
  associationEvidence: string
  sourcePresence: 'present' | 'missing' | 'ambiguous' | 'size_mismatch' | 'content_mismatch' | 'oversized'
    | 'not_applicable' | 'unknown'
}

type InternalArtifactRow = {
  asset_id: string
  conv_id: string | null
  category: ArtifactSourceAsset['category']
  kind: string
  name: string
  preview: string
  url: string | null
  source_relative_path: string | null
  source_size: number | null
  created_at: number
  sender_name: string
  materialization: string
  preview_status: string
  association_status: ArtifactSourceAsset['associationStatus']
  association_evidence: string
  source_presence: ArtifactSourceAsset['sourcePresence']
  source_content_sha256: string | null
  materialized_relative_path: string | null
  materialized_size: number | null
  materialized_content_sha256: string | null
  media_format: string | null
}

export type ArtifactSourceResolution =
  | { status: 'malformed' }
  | { status: 'unknown' }
  | { status: 'unsupported'; state: ChatArtifactAvailability; asset: ArtifactSourceAsset }
  | { status: 'unavailable'; state: ChatArtifactAvailability; asset: ArtifactSourceAsset }
  | {
      status: 'configuration_unavailable'
      state: 'source_unavailable'
      asset: ArtifactSourceAsset
    }
  | {
      status: 'available'
      state: 'ready' | 'thumbnail_only'
      asset: ArtifactSourceAsset
      target: string
    }

export type ArtifactSourceDescription =
  | { status: 'malformed' }
  | { status: 'unknown' }
  | { status: 'known'; asset: ArtifactSourceAsset }

export type ArtifactSourceResolver = {
  describe: (id: string) => ArtifactSourceDescription
  resolve: (id: string, purpose: ArtifactSourcePurpose) => ArtifactSourceResolution
}

export type ArtifactSourceResolverOptions = {
  assetDb: DatabaseSync
  accountRoot?: string
  accountRootProvider?: (assetDb: DatabaseSync) => string | null
  bundleRoot?: string
  projectRoot?: string
  environment?: LocalEnvironment
}

export type ArtifactAccountRootProviderOptions = Omit<ArtifactSourceResolverOptions, 'assetDb' | 'accountRootProvider'>

function publicAsset(row: InternalArtifactRow): ArtifactSourceAsset {
  return {
    id: row.asset_id,
    conversationId: row.conv_id,
    category: row.category,
    kind: row.kind,
    name: row.name,
    preview: row.preview,
    url: row.url,
    createdAt: Number(row.created_at),
    senderName: row.sender_name,
    size: row.source_size === null ? null : Number(row.source_size),
    materialization: row.materialization,
    previewStatus: row.preview_status,
    associationStatus: row.association_status,
    associationEvidence: row.association_evidence,
    sourcePresence: row.source_presence,
  }
}

function canonicalDirectory(candidate: string) {
  const real = fs.realpathSync(candidate)
  return fs.statSync(real).isDirectory() ? real : null
}
function accountRootFingerprint(accountRoot: string) {
  const canonical = process.platform === 'win32' ? accountRoot.toLowerCase() : accountRoot
  return `sha256:${crypto.createHash('sha256').update(`chatfiles-path-v1\0${canonical}`, 'utf8').digest('hex')}`
}
function expectedAccountRootFingerprint(assetDb: DatabaseSync) {
  try {
    const row = assetDb.prepare(`
      SELECT account_root_fingerprint FROM asset_runs LIMIT 2
    `).all() as Array<{ account_root_fingerprint: string }>
    return row.length === 1 && /^sha256:[a-f0-9]{64}$/u.test(row[0]?.account_root_fingerprint ?? '')
      ? row[0]!.account_root_fingerprint
      : null
  } catch {
    return null
  }
}
function boundAccountRoot(candidate: string, assetDb?: DatabaseSync) {
  const canonical = canonicalDirectory(candidate)
  if (!canonical) return null
  const expected = assetDb ? expectedAccountRootFingerprint(assetDb) : null
  return expected && accountRootFingerprint(canonical) !== expected ? null : canonical
}
function accountRootFromOptions(
  options: ArtifactAccountRootProviderOptions,
  assetDb?: DatabaseSync,
) {
  try {
    if (options.accountRoot !== undefined) return boundAccountRoot(options.accountRoot, assetDb)
    const projectRoot = options.projectRoot ?? root
    const environment = options.environment ?? { ...process.env }
    loadLocalEnv({ filePath: path.join(projectRoot, '.env.local'), environment })
    const configured = environment.WECHAT_STORE?.trim()
    if (!configured) return null
    const store = path.resolve(configured)
    if (path.basename(store).toLowerCase().startsWith('wxid_')) return boundAccountRoot(store, assetDb)
    if (!fs.statSync(store).isDirectory()) return null
    const accounts = fs.readdirSync(store, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.toLowerCase().startsWith('wxid_'))
      .map((entry) => path.join(store, entry.name))
    if (accounts.length === 1) return boundAccountRoot(accounts[0]!, assetDb)
    const expected = assetDb ? expectedAccountRootFingerprint(assetDb) : null
    if (!expected) return null
    const matches = accounts.flatMap((account) => {
      const canonical = canonicalDirectory(account)
      return canonical && accountRootFingerprint(canonical) === expected ? [canonical] : []
    })
    return matches.length === 1 ? matches[0]! : null
  } catch {
    return null
  }
}

export function createArtifactAccountRootProvider(options: ArtifactAccountRootProviderOptions) {
  let selected = false
  let accountRoot: string | null = null
  return (assetDb: DatabaseSync) => {
    if (!selected) {
      accountRoot = accountRootFromOptions(options, assetDb)
      selected = true
    }
    return accountRoot
  }
}

export function createArtifactSourceResolver(
  options: ArtifactSourceResolverOptions,
): ArtifactSourceResolver {
  let accountRoot: string | null
  try {
    if (options.accountRootProvider) {
      const providedRoot = options.accountRootProvider(options.assetDb)
      accountRoot = providedRoot ? boundAccountRoot(providedRoot, options.assetDb) : null
    } else {
      accountRoot = accountRootFromOptions(options, options.assetDb)
    }
  } catch {
    accountRoot = null
  }
  let bundleRoot: string | null = null
  try {
    bundleRoot = canonicalDirectory(options.bundleRoot
      ?? path.join(options.projectRoot ?? root, 'data', 'chat-assets.current'))
  } catch { /* Missing materialized root stays unavailable. */ }
  const shape = inspectArtifactStorage(options.assetDb)
  const find = options.assetDb.prepare(`
    SELECT asset_id, conv_id, category, kind, name, preview, url,
           source_relative_path, source_size, created_at, sender_name,
           materialization, preview_status,
           ${shape.associationStatus} AS association_status,
           ${shape.associationEvidence} AS association_evidence,
           ${shape.sourcePresence} AS source_presence,
           ${shape.sourceContentSha256} AS source_content_sha256,
           ${shape.materializedRelativePath} AS materialized_relative_path,
           ${shape.materializedSize} AS materialized_size,
           ${shape.materializedContentSha256} AS materialized_content_sha256,
           ${shape.mediaFormat} AS media_format
    FROM artifacts WHERE asset_id=? AND ${shape.verifiedPredicate}
  `)

  function rowFor(id: string) {
    if (!/^[0-9a-f]{64}$/u.test(id)) return { status: 'malformed' as const }
    const row = find.get(id) as InternalArtifactRow | undefined
    return row ? { status: 'known' as const, row } : { status: 'unknown' as const }
  }

  return {
    describe(id) {
      const found = rowFor(id)
      return found.status === 'known'
        ? { status: 'known', asset: publicAsset(found.row) }
        : found
    },
    resolve(id, purpose) {
      const found = rowFor(id)
      if (found.status !== 'known') return found
      const row = found.row
      const asset = publicAsset(row)
      const state = artifactAvailabilityFor(row.materialization, row.preview_status, shape.version)
      if (row.kind !== 'resource' && row.kind !== 'voice') {
        return { status: 'unsupported', state, asset }
      }
      const materializedReady = shape.version === 2
        ? row.materialization === 'ready'
        : row.materialization === 'exported'

      const hasMaterializedOutput = Boolean(row.materialized_relative_path)
      const canRead = purpose === 'content'
        ? materializedReady && (row.preview_status === 'ready' || hasMaterializedOutput)
        : (row.preview === 'image' || row.preview === 'video')
          && (
            (materializedReady && row.preview_status === 'ready')
            || (row.materialization === 'thumbnail_only' && row.preview_status === 'thumbnail_only')
          )
      if (!canRead) {
        if (purpose === 'thumbnail' && row.preview !== 'image' && row.preview !== 'video') {
          return { status: 'unsupported', state, asset }
        }
        return { status: 'unavailable', state, asset }
      }

      if (hasMaterializedOutput) {
        if (/\.dat$/iu.test(row.materialized_relative_path ?? '')) {
          return { status: 'unavailable', state: 'source_unavailable', asset }
        }
        if (!bundleRoot) {
          return { status: 'configuration_unavailable', state: 'source_unavailable', asset }
        }
        const target = resolveArtifactFile({
          root: bundleRoot,relativePath: row.materialized_relative_path,
          expectedSize: row.materialized_size,contentSha256: row.materialized_content_sha256,
          requireContentDigest: true,requireMediaFormat: true,mediaFormat: row.media_format,
        })
        if (!target) return { status: 'unavailable', state: 'source_unavailable', asset }
        return {
          status: 'available',state: state === 'thumbnail_only' ? 'thumbnail_only' : 'ready',asset,target,
        }
      }
      if (row.kind !== 'resource') return { status: 'unsupported', state, asset }
      if (/\.dat$/iu.test(row.source_relative_path ?? '')) {
        return { status: 'unavailable', state: 'source_unavailable', asset }
      }
      if (!accountRoot) return { status: 'configuration_unavailable', state: 'source_unavailable', asset }
      const target = resolveArtifactFile({
        root: accountRoot,relativePath: row.source_relative_path,expectedSize: row.source_size,
        contentSha256: row.source_content_sha256,requireContentDigest: shape.version === 2,
      })
      if (!target) return { status: 'unavailable', state: 'source_unavailable', asset }
      return { status: 'available', state: state === 'thumbnail_only' ? 'thumbnail_only' : 'ready', asset, target }
    },
  }
}
