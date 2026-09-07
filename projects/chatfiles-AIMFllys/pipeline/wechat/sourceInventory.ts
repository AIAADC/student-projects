import fs from 'node:fs'
import path from 'node:path'

export type SourceDomain = 'biz' | 'media' | 'regular' | 'resource' | 'unknown'

export type SourceDatabase = {
  absolutePath: string
  domain: SourceDomain
  filename: string
}

export function sourceDomain(filename: string): SourceDomain {
  if (/^biz_message_[0-9]+\.db$/u.test(filename)) return 'biz'
  if (/^media_[0-9]+\.db$/u.test(filename)) return 'media'
  if (/^message_[0-9]+\.db$/u.test(filename)) return 'regular'
  if (filename === 'message_resource.db') return 'resource'
  return 'unknown'
}

function isStrictChild(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== ''
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
}

export function discoverSourceDatabases(snapshotDir: string): SourceDatabase[] {
  const snapshotPath = path.resolve(snapshotDir)
  if (!fs.existsSync(snapshotPath)) return []
  const snapshotRoot = fs.realpathSync(snapshotPath)
  if (!fs.statSync(snapshotRoot).isDirectory()) return []
  const messagePath = path.join(snapshotRoot, 'db_storage', 'message')
  if (!fs.existsSync(messagePath)) return []
  const messageDir = fs.realpathSync(messagePath)
  if (!isStrictChild(snapshotRoot, messageDir) || !fs.statSync(messageDir).isDirectory()) {
    throw new Error('SOURCE_SNAPSHOT_PATH_UNSAFE')
  }
  const databases = fs.readdirSync(messageDir, { withFileTypes: true })
    .filter((entry) => entry.name.endsWith('.db'))
    .map((entry) => {
      const candidate = path.join(messageDir, entry.name)
      const leaf = fs.lstatSync(candidate)
      if (!entry.isFile() || !leaf.isFile() || leaf.isSymbolicLink()) return null
      const absolutePath = fs.realpathSync(candidate)
      if (!isStrictChild(messageDir, absolutePath)) {
        throw new Error('SOURCE_SNAPSHOT_PATH_UNSAFE')
      }
      return {
        absolutePath,
        domain: sourceDomain(entry.name),
        filename: entry.name,
      }
    })
    .filter((entry): entry is SourceDatabase => entry !== null)
  return databases.sort((left, right) => left.filename.localeCompare(right.filename))
}
