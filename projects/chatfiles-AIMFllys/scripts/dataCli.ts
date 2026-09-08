import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  catalogTransactionIdSchema,
  productCatalogSchema,
  productKindSchema,
  type ProductKind,
} from '../shared/contracts/productCatalog.js'
import { activateCatalog, recoverCatalog, rollbackCatalog } from './data/catalogTransaction.js'
import { inspectDataProducts } from './data/dataDoctor.js'
import { planGeneratedPrune } from './data/generatedPrune.js'
import { migrateLegacyLayout } from './data/legacyMigration.js'
import { strictRealDirectory } from './data/productFiles.js'
import { sealStagedProductRelease } from './data/productLifecycle.js'
import { stageProductCandidate } from './data/productStager.js'

type Awaitable<T> = T | Promise<T>
type TransactionInput = { transactionId: string }
type ProductInput = TransactionInput & { kind: ProductKind;accountRoot?: string }
type MigrationInput = TransactionInput & { fromLegacyLayout: true; accountRoot: string }

export type DataCliOperations = {
  doctor: () => Awaitable<unknown>
  recover: () => Awaitable<unknown>
  stage: (input: ProductInput) => Awaitable<unknown>
  seal: (input: ProductInput) => Awaitable<unknown>
  activate: (input: TransactionInput) => Awaitable<unknown>
  rollback: (input: TransactionInput) => Awaitable<unknown>
  migrate: (input: MigrationInput) => Awaitable<unknown>
  prune: (input: { dryRun: true }) => Awaitable<unknown>
}

type ParsedCommand =
  | { command: 'doctor' | 'recover' }
  | { command: 'stage' | 'seal'; kind: ProductKind; transactionId: string;accountRoot?: string }
  | { command: 'activate' | 'rollback'; transactionId: string }
  | { command: 'migrate'; transactionId: string; fromLegacyLayout: true; accountRoot: string }
  | { command: 'prune'; dryRun: true }

type Dependencies = {
  operations?: DataCliOperations
  stdout?: (value: string) => void
  stderr?: (value: string) => void
}

const projectRoot = path.resolve(import.meta.dirname, '..')
const dataRoot = path.join(projectRoot, 'data')
const booleanFlags = new Set(['--dry-run', '--from-legacy-layout'])

function exactFlags(flags: Map<string, string | true>, expected: readonly string[]) {
  return flags.size === expected.length && expected.every((name) => flags.has(name))
}

function stringFlag(flags: Map<string, string | true>, name: string) {
  const value = flags.get(name)
  return typeof value === 'string' ? value : undefined
}

function validTransaction(value: string | undefined) {
  const result = catalogTransactionIdSchema.safeParse(value)
  return result.success ? result.data : undefined
}

function parseCommand(args: readonly string[]): ParsedCommand | undefined {
  const [command, ...rest] = args
  if (!command) return undefined
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (!item) return undefined
    if (!item.startsWith('--')) {
      positionals.push(item)
      continue
    }
    if (flags.has(item)) return undefined
    if (booleanFlags.has(item)) {
      flags.set(item, true)
      continue
    }
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) return undefined
    flags.set(item, value)
    index += 1
  }
  if ((command === 'doctor' || command === 'recover')
    && positionals.length === 0 && exactFlags(flags, [])) return { command }
  if (command === 'stage' && positionals.length === 1 && exactFlags(flags, ['--transaction'])) {
    const kind = productKindSchema.safeParse(positionals[0])
    const transactionId = validTransaction(stringFlag(flags, '--transaction'))
    if (kind.success && transactionId) return { command,kind: kind.data,transactionId }
  }
  if (command === 'seal' && positionals.length === 1) {
    const kind = productKindSchema.safeParse(positionals[0])
    const expected = kind.success && kind.data === 'assets'
      ? ['--transaction','--account-root'] : ['--transaction']
    const transactionId = validTransaction(stringFlag(flags, '--transaction'))
    const accountRoot = stringFlag(flags, '--account-root')
    if (kind.success && transactionId && exactFlags(flags, expected)
      && (kind.data !== 'assets' || (accountRoot && accountRoot.length <= 4096
        && !accountRoot.includes('\0')))) {
      return { command,kind: kind.data,transactionId,...(accountRoot ? { accountRoot } : {}) }
    }
  }
  if ((command === 'activate' || command === 'rollback')
    && positionals.length === 0 && exactFlags(flags, ['--transaction'])) {
    const transactionId = validTransaction(stringFlag(flags, '--transaction'))
    if (transactionId) return { command,transactionId }
  }
  if (command === 'migrate' && positionals.length === 0
    && exactFlags(flags, ['--from-legacy-layout', '--transaction', '--account-root'])) {
    const transactionId = validTransaction(stringFlag(flags, '--transaction'))
    const accountRoot = stringFlag(flags, '--account-root')
    if (transactionId && accountRoot && accountRoot.length <= 4096 && !accountRoot.includes('\0')) {
      return { command,transactionId,fromLegacyLayout: true,accountRoot }
    }
  }
  if (command === 'prune' && positionals.length === 0
    && exactFlags(flags, ['--dry-run'])) return { command,dryRun: true }
  return undefined
}

function containsAbsolutePath(value: string) {
  return path.win32.isAbsolute(value) || path.posix.isAbsolute(value)
    || /[A-Za-z]:[\\/]/u.test(value) || /\\\\[^\\/\s]+[\\/]/u.test(value)
    || /file:\/\//iu.test(value) || /(?:^|[\s("'=])\/(?!\/)/u.test(value)
}

function sanitize(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    const pathKey = key !== 'relativePath' && /(?:path|root|dir|directory|filename)$/iu.test(key)
    return pathKey || containsAbsolutePath(value) ? '[redacted]' : value
  }
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry, '', seen))
  if (typeof value !== 'object') return null
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  const output: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(value)) {
    const safeName = containsAbsolutePath(name) ? '[redacted]' : name
    output[safeName] = sanitize(entry, name, seen)
  }
  seen.delete(value)
  return output
}

function json(value: unknown) {
  return `${JSON.stringify(sanitize(value))}\n`
}

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return /^[A-Z][A-Z0-9_]{0,127}$/u.test(message) ? message : 'DATA_COMMAND_FAILED'
}

export function readCatalogCandidate(dataRootInput: string, transactionId: string) {
  const safeDataRoot = strictRealDirectory(dataRootInput, 'DATA_CATALOG_CANDIDATE_UNSAFE')
  const filename = path.join(safeDataRoot, 'catalog.next.json')
  if (!fs.existsSync(filename)) throw new Error('DATA_CATALOG_CANDIDATE_MISSING')
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('DATA_CATALOG_CANDIDATE_UNSAFE')
  let value: unknown
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(filename))
    value = JSON.parse(source)
  } catch (error) {
    throw new Error('DATA_CATALOG_CANDIDATE_INVALID', { cause: error })
  }
  const parsed = productCatalogSchema.safeParse(value)
  if (!parsed.success) throw new Error('DATA_CATALOG_CANDIDATE_INVALID')
  if (parsed.data.transactionId !== transactionId) {
    throw new Error('DATA_CATALOG_TRANSACTION_MISMATCH')
  }
  return parsed.data
}

function sealStagedProduct(input: ProductInput) {
  return sealStagedProductRelease({
    projectRoot,dataRoot,transactionId: input.transactionId,kind: input.kind,
    ...(input.accountRoot ? { accountRoot: path.resolve(projectRoot, input.accountRoot) } : {}),
  })
}

export function createDefaultDataCliOperations(): DataCliOperations {
  return {
    doctor: () => inspectDataProducts(dataRoot),
    recover: () => recoverCatalog(dataRoot),
    stage: ({ transactionId,kind }) => stageProductCandidate({ dataRoot,transactionId,kind }),
    seal: sealStagedProduct,
    activate: ({ transactionId }) => activateCatalog({
      dataRoot,catalog: readCatalogCandidate(dataRoot, transactionId),
    }),
    rollback: ({ transactionId }) => rollbackCatalog({
      dataRoot,transactionId,committedAt: new Date().toISOString(),
    }),
    migrate: ({ transactionId,accountRoot }) => migrateLegacyLayout({
      projectRoot,transactionId,accountRoot: path.resolve(projectRoot, accountRoot),
    }),
    prune: () => planGeneratedPrune(dataRoot),
  }
}

export async function runDataCli(args: readonly string[], dependencies: Dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value: string) => process.stdout.write(value))
  const stderr = dependencies.stderr ?? ((value: string) => process.stderr.write(value))
  const parsed = parseCommand(args)
  if (!parsed) {
    stderr(json({ status: 'failed',errorCode: 'CLI_ARGUMENT_INVALID' }))
    return 2
  }
  const operations = dependencies.operations ?? createDefaultDataCliOperations()
  try {
    let result: unknown
    switch (parsed.command) {
      case 'doctor': result = await operations.doctor(); break
      case 'recover': result = await operations.recover(); break
      case 'stage': result = await operations.stage({
        kind: parsed.kind,transactionId: parsed.transactionId,
      }); break
      case 'seal': result = await operations.seal({
        kind: parsed.kind,transactionId: parsed.transactionId,
        ...('accountRoot' in parsed && parsed.accountRoot ? { accountRoot: parsed.accountRoot } : {}),
      }); break
      case 'activate': result = await operations.activate({ transactionId: parsed.transactionId }); break
      case 'rollback': result = await operations.rollback({ transactionId: parsed.transactionId }); break
      case 'migrate': result = await operations.migrate({
        transactionId: parsed.transactionId,
        fromLegacyLayout: true,
        accountRoot: parsed.accountRoot,
      }); break
      case 'prune': result = await operations.prune({ dryRun: true }); break
    }
    stdout(json(result))
    return 0
  } catch (error) {
    stderr(json({ status: 'failed',errorCode: safeErrorCode(error) }))
    return 1
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDataCli(process.argv.slice(2))
}
