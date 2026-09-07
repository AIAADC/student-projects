import assert from 'node:assert/strict'
import test from 'node:test'

import { loadLocalEnv, parseSimpleDotEnv } from './localEnv.js'

test('parses Chinese paths from strict UTF-8 without evaluating dotenv syntax', () => {
  const source = Buffer.from(
    [
      '\uFEFF# 本机路径只留在未跟踪配置中',
      'WECHAT_STORE="D:\\聊天迁移\\xwechat_files"',
      "QQ_NUMBER='123456789'",
      'LITERAL=$(whoami)',
      '',
    ].join('\r\n'),
    'utf8',
  )

  assert.deepEqual(parseSimpleDotEnv(source), {
    WECHAT_STORE: 'D:\\聊天迁移\\xwechat_files',
    QQ_NUMBER: '123456789',
    LITERAL: '$(whoami)',
  })
})

test('rejects malformed dotenv input without echoing its private value', () => {
  const privateValue = 'D:\\绝密聊天\\xwechat_files'

  assert.throws(
    () => parseSimpleDotEnv(Buffer.from(`WECHAT_STORE="${privateValue}\n`, 'utf8')),
    (error: unknown) => error instanceof Error && !error.message.includes(privateValue) && /line 1/i.test(error.message),
  )
})

test('rejects invalid UTF-8 instead of replacing bytes', () => {
  const prefix = Buffer.from('WECHAT_STORE=', 'utf8')
  const source = Buffer.concat([prefix, Buffer.from([0xff])])

  assert.throws(() => parseSimpleDotEnv(source), /UTF-8/)
})

test('loads only missing values and does not disclose configuration values', () => {
  const environment: NodeJS.ProcessEnv = { QQ_NUMBER: 'already-set' }
  const messages: string[] = []

  const result = loadLocalEnv({
    filePath: 'D:\\project\\.env.local',
    environment,
    readFile: () => Buffer.from('QQ_NUMBER=from-file\nWECHAT_STORE=D:\\迁移数据\\xwechat_files\n', 'utf8'),
    onNotice: (message) => messages.push(message),
  })

  assert.equal(environment.QQ_NUMBER, 'already-set')
  assert.equal(environment.WECHAT_STORE, 'D:\\迁移数据\\xwechat_files')
  assert.deepEqual(result.loadedKeys, ['WECHAT_STORE'])
  assert.deepEqual(result.preservedKeys, ['QQ_NUMBER'])
  assert.equal(messages.some((message) => message.includes('迁移数据') || message.includes('already-set')), false)
})
