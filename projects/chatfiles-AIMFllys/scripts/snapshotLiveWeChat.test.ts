import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseSnapshotCliArgs,
  runSnapshotCli,
} from './snapshotLiveWeChat.js'
import { LiveSnapshotError } from './wechat/liveSnapshotCoordinator.js'

test('parses explicit live snapshot arguments without accepting positional secrets', () => {
  assert.deepEqual(parseSnapshotCliArgs([
    '--pid', '4321',
    '--account-root', 'C:\\微信数据\\wxid_fixture',
    '--output-root', 'D:\\snapshot-output',
    '--scanner', 'D:\\tools\\scanner.exe',
    '--snapshot-helper', 'D:\\tools\\snapshot-helper.exe',
    '--run-id', 'fixture-run',
  ]), {
    pid: 4321,
    accountRoot: 'C:\\微信数据\\wxid_fixture',
    outputRoot: 'D:\\snapshot-output',
    scannerPath: 'D:\\tools\\scanner.exe',
    snapshotHelperPath: 'D:\\tools\\snapshot-helper.exe',
    runId: 'fixture-run',
  })
  assert.throws(() => parseSnapshotCliArgs(['4321', 'secret']), /CLI_ARGUMENT_INVALID/u)
})

test('prints only sanitized run metadata and never propagates path-bearing failures', async () => {
  const stdout: string[] = []
  const stderr: string[] = []
  const ok = await runSnapshotCli([
    '--pid', '1', '--account-root', 'C:\\private', '--output-root', 'D:\\out', '--scanner', 'scan.exe',
    '--snapshot-helper', 'snapshot.exe',
  ], {
    run: async () => ({ runId: 'safe-run', databaseCount: 4 }),
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  })
  assert.equal(ok, 0)
  assert.deepEqual(JSON.parse(stdout.join('')), { status: 'complete', runId: 'safe-run', databaseCount: 4 })

  const failed = await runSnapshotCli([
    '--pid', '1', '--account-root', 'C:\\private', '--output-root', 'D:\\out', '--scanner', 'scan.exe',
    '--snapshot-helper', 'snapshot.exe',
  ], {
    run: async () => { throw new LiveSnapshotError('BACKUP_FAILED') },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
  })
  assert.equal(failed, 1)
  assert.deepEqual(JSON.parse(stderr.join('')), { status: 'failed', errorCode: 'BACKUP_FAILED' })
  assert.equal(stderr.join('').includes('private'), false)
})
