import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMessageContent } from './messageTypeRegistry.js'

test('keeps app links and file evidence structured instead of flattening it away', () => {
  const parsed = parseMessageContent(49, [
    '<appmsg><title>课程资料</title><des>请查收</des>',
    '<url>https://example.com/a</url><fileext>pdf</fileext>',
    '<sourcedisplayname>资料助手</sourcedisplayname></appmsg>',
  ].join(''), false)

  assert.equal(parsed.kind, 'app')
  assert.equal(parsed.text, '课程资料 — 请查收 — [文件 .pdf] — https://example.com/a — (资料助手)')
  assert.deepEqual(parsed.structured, {
    appName: '资料助手',
    description: '请查收',
    fileExtension: 'pdf',
    title: '课程资料',
    urls: ['https://example.com/a'],
  })
})

test('retains app and media locators needed by later asset materialization', () => {
  const app = parseMessageContent(49, [
    '<appmsg><title>课程压缩包</title><appattach>',
    '<attachid>attach-42</attachid><filekey>file-key-42</filekey>',
    '<md5>0123456789abcdef0123456789abcdef</md5>',
    '<cdnattachurl>https://cdn.example/app-42</cdnattachurl>',
    '</appattach></appmsg>',
  ].join(''), false)
  assert.deepEqual(app.structured.fileIdentifiers, {
    attachId: 'attach-42',
    fileKey: 'file-key-42',
    md5: '0123456789abcdef0123456789abcdef',
  })
  assert.deepEqual(app.structured.cdnReferences, {
    attachment: 'https://cdn.example/app-42',
  })

  const media = parseMessageContent(3, [
    '<msg><img md5="fedcba9876543210fedcba9876543210" ',
    'cdnmidimgurl="https://cdn.example/image-42" ',
    'cdnthumburl="https://cdn.example/thumb-42" /></msg>',
  ].join(''), false)
  assert.deepEqual(media.structured, {
    mediaType: 'image',
    fileIdentifiers: { md5: 'fedcba9876543210fedcba9876543210' },
    cdnReferences: {
      original: 'https://cdn.example/image-42',
      thumbnail: 'https://cdn.example/thumb-42',
    },
  })
})

test('classifies media, system, text and unknown messages without guessing', () => {
  assert.equal(parseMessageContent(3, '', false).kind, 'media')
  assert.equal(parseMessageContent(10000, '<p>成员加入</p>', false).kind, 'system')
  assert.equal(parseMessageContent(1, 'wxid_member:\n中文正文', true).senderPrefix, 'wxid_member')
  assert.deepEqual(parseMessageContent(999, 'opaque', false), {
    kind: 'unknown', senderPrefix: '', structured: { rawTypeLabel: 'type_999' }, text: '[type_999]',
  })
})
