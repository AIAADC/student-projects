import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createEphemeralKeyProvider,
  parseConversationMediaArguments,
} from './materializeConversationMedia.js'

test('parses only explicit media bundle arguments and never accepts a key path', () => {
  assert.deepEqual(parseConversationMediaArguments([
    '--bundle','data/chat-assets.next','--account-root','fixture-account',
    '--key-stdin','--key-version','v2','--xor-key','0xa5','--concurrency','3',
  ], 'C:\\project'), {
    bundleDir: 'C:\\project\\data\\chat-assets.next',
    accountRoot: 'C:\\project\\fixture-account',
    keyFromStdin: true,
    keyVersion: 'v2',
    xorKey: 0xa5,
    concurrency: 3,
  })
  assert.throws(
    () => parseConversationMediaArguments(['--key-file','image_key.json'], 'C:\\project'),
    /Unknown argument/u,
  )
  assert.throws(
    () => parseConversationMediaArguments(['data/chat-assets.next'], 'C:\\project'),
    /Unknown argument/u,
  )
})

test('copies, clears, and disposes an injected key without persisting it', async () => {
  const input = Buffer.from('0123456789abcdef', 'ascii')
  const ephemeral = createEphemeralKeyProvider(input, 'v2')
  assert.deepEqual(input, Buffer.alloc(16))
  const provided = await ephemeral.provider.provide('v2')
  assert.deepEqual(Buffer.from(provided ?? []), Buffer.from('0123456789abcdef', 'ascii'))
  provided?.fill(0)
  assert.equal(await ephemeral.provider.provide('v1'), null)
  ephemeral.dispose()
  assert.equal(await ephemeral.provider.provide('v2'), null)
})
