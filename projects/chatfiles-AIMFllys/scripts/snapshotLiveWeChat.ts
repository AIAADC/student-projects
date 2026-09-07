import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LiveSnapshotError,
  runLiveSnapshot,
} from './wechat/liveSnapshotCoordinator.js'

type SnapshotCliOptions = {
  pid: number
  accountRoot: string
  outputRoot: string
  scannerPath: string
  snapshotHelperPath: string
  runId?: string
}

const flagNames = new Set(['--pid', '--account-root', '--output-root', '--scanner', '--snapshot-helper', '--run-id'])

export function parseSnapshotCliArgs(args: string[]): SnapshotCliOptions {
  const values = new Map<string, string>()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag || !flagNames.has(flag) || !value || values.has(flag)) {
      throw new Error('CLI_ARGUMENT_INVALID')
    }
    values.set(flag, value)
  }
  const pidText = values.get('--pid')
  const accountRoot = values.get('--account-root')
  const outputRoot = values.get('--output-root')
  const scannerPath = values.get('--scanner')
  const snapshotHelperPath = values.get('--snapshot-helper')
  const pid = Number(pidText)
  if (!Number.isSafeInteger(pid) || pid <= 0 || !accountRoot || !outputRoot || !scannerPath || !snapshotHelperPath) {
    throw new Error('CLI_ARGUMENT_INVALID')
  }
  return {
    pid,
    accountRoot,
    outputRoot,
    scannerPath,
    snapshotHelperPath,
    ...(values.has('--run-id') ? { runId: values.get('--run-id') } : {}),
  }
}

export async function runSnapshotCli(
  args: string[],
  dependencies: {
    run?: typeof runLiveSnapshot
    stdout?: (text: string) => void
    stderr?: (text: string) => void
  } = {},
) {
  const run = dependencies.run ?? runLiveSnapshot
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text))
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text))
  try {
    const result = await run(parseSnapshotCliArgs(args))
    stdout(`${JSON.stringify({ status: 'complete', ...result })}\n`)
    return 0
  } catch (error) {
    const errorCode = error instanceof LiveSnapshotError
      ? error.code
      : error instanceof Error && error.message === 'CLI_ARGUMENT_INVALID'
        ? 'CLI_ARGUMENT_INVALID'
        : 'SNAPSHOT_FAILED'
    stderr(`${JSON.stringify({ status: 'failed', errorCode })}\n`)
    return 1
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runSnapshotCli(process.argv.slice(2))
}
