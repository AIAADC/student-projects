import assert from 'node:assert/strict'
import test from 'node:test'
import { parseDailyMediaExportArguments } from './exportConversationDailyMedia.js'

test('requires explicit conversation and bundle inputs without hardcoded account or group names', () => {
  assert.deepEqual(parseDailyMediaExportArguments([
    '--wechat-db','data/wechat.next/wechat.db',
    '--asset-db','data/chat-assets.next/artifacts.db',
    '--bundle-root','data/chat-assets.next',
    '--conversation','conv-stable-id',
    '--output','docs/tmp/IP/训练营',
    '--account-root','fixture-account',
  ], 'C:\\project'), {
    wechatDbPath: 'C:\\project\\data\\wechat.next\\wechat.db',
    assetDbPath: 'C:\\project\\data\\chat-assets.next\\artifacts.db',
    bundleRoot: 'C:\\project\\data\\chat-assets.next',
    conversationId: 'conv-stable-id',
    outputRoot: 'C:\\project\\docs\\tmp\\IP\\训练营',
    accountRoot: 'C:\\project\\fixture-account',
  })
  assert.throws(
    () => parseDailyMediaExportArguments(['--conversation','群名称'], 'C:\\project'),
    /Missing required daily media argument/u,
  )
})
