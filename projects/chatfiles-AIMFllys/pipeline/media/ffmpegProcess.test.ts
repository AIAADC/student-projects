import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { createFfmpegProcessRunner, type FfmpegInvocation } from './wxgfMaterializer.js'

test('waits for close after timeout and escalates termination once', async () => {
  const child = new EventEmitter() as EventEmitter & {
    kill: (signal?: NodeJS.Signals) => boolean
  }
  const signals: Array<NodeJS.Signals | undefined> = []
  const hardKilled = new Promise<void>((resolve) => {
    child.kill = (signal) => {
      signals.push(signal)
      if (signal === 'SIGKILL') resolve()
      return true
    }
  })
  const run = createFfmpegProcessRunner(() => child, { killGraceMs: 5 })
  const invocation: FfmpegInvocation = {
    executable: 'ffmpeg',args: [],cwd: process.cwd(),shell: false,timeoutMs: 5,
  }
  let settled = false
  const completion = assert.rejects(run(invocation).finally(() => { settled = true }), (error) => (
    (error as NodeJS.ErrnoException).code === 'ETIMEDOUT'
  ))

  await hardKilled
  assert.deepEqual(signals, [undefined, 'SIGKILL'])
  assert.equal(settled, false)
  child.emit('close', null)
  await completion
  assert.equal(settled, true)
})
