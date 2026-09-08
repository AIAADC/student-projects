import path from 'node:path'

const PRIVATE_ROOTS = new Set([
  '.claude',
  '.cursor',
  '.playwright-cli',
  '.uploads',
  '.worktrees',
  'archive',
  'data',
  'imports',
  'logs',
  'secrets',
  'work',
])

const PRIVATE_EXTENSIONS = new Set([
  '.db',
  '.db-journal',
  '.db-shm',
  '.db-wal',
  '.exe',
  '.key',
  '.keystore',
  '.local',
  '.log',
  '.p12',
  '.pem',
  '.pfx',
  '.sqlite',
  '.sqlite-journal',
  '.sqlite-shm',
  '.sqlite-wal',
  '.sqlite3',
  '.sqlite3-journal',
  '.sqlite3-shm',
  '.sqlite3-wal',
])

const PRIVATE_SCRIPT_NAMES = new Set([
  '_checkgrownrecovery.mjs',
  'aggregateinsightsbycategory.ts',
  'bootstrapinsightstate.ts',
  'checkbatch3.mjs',
  'checkbatch3quality.mjs',
  'computeupdatedelta.ts',
  'countbatch3.mjs',
  'extractbatch3remaining.mjs',
  'find_image_key.py',
  'find_image_key2.py',
  'generatebatch1insights.mjs',
  'generatebatch8insights.mjs',
  'generatemissing282_499.mjs',
  'mergeinsightdelta.ts',
  'processbatch6.mjs',
  'processdeltainsights.mjs',
  'processmissing282.mjs',
  'recoverconvfiles.mjs',
  'runbatch4insights.mjs',
  'summarizependingbatch3.mjs',
  'updateinsightstate.ts',
  'validatebatch8.mjs',
  'verifybatch4.mjs',
  'writebatch1insights.mjs',
  'writebatch3insights.mjs',
  'writebatch5insights.ts',
  'writebatch6insights.mjs',
  'writebatch7insights.mjs',
  'writebatch8insights.mjs',
])

export function privacyReason(relativePath: string) {
  const lower = relativePath.replaceAll('\\', '/').toLowerCase()
  const segments = lower.split('/')
  const basename = segments.at(-1) ?? ''
  if (segments[0] && PRIVATE_ROOTS.has(segments[0])) return `private root ${segments[0]}`
  if (lower === 'docs/tmp' || lower.startsWith('docs/tmp/')) return 'private temporary documentation'
  if (lower === 'scripts/tmp' || lower.startsWith('scripts/tmp/')) return 'private script workspace'
  if ((basename === '.env' || basename.startsWith('.env.')) && basename !== '.env.example') return 'private environment file'
  if (basename === 'image_key.json') return 'private image key'
  if (basename.startsWith('secrets.')) return 'private secrets file'
  if (PRIVATE_EXTENSIONS.has(path.extname(basename).toLowerCase())) return 'private file extension'
  if (/^(npm-debug|yarn-debug|yarn-error|pnpm-debug|lerna-debug)\.log(?:\..*)?$/u.test(basename)) return 'private package log'
  if (/^scripts\/_test_.*\.png$/u.test(lower)) return 'private test output'
  if (/^scripts\/exportip.*\.mjs$/u.test(lower)) return 'private export helper'
  if (/^scripts\/(batch_.*_insights_data|missing.*_overrides)\.json$/u.test(lower)) return 'private local override'
  if (segments[0] === 'scripts' && PRIVATE_SCRIPT_NAMES.has(basename)) return 'private local helper'
  return undefined
}
