import assert from 'node:assert/strict'
import test from 'node:test'

import { classifyArtifactCategory, extractStructuredUrls, isIncludedInAll } from './assetEvidence.js'
test('classifies artifact categories with deterministic evidence precedence', () => {
  const cases = [
    [{ name: 'apple-design SKILL.md', preview: 'markdown', url: 'https://example.com' }, 'skill'],
    [{ name: '课程讲义.pdf', preview: 'image', url: 'https://example.com' }, 'document'],
    [{ name: '交互作品.html', preview: 'html', url: 'https://example.com' }, 'work'],
    [{ name: 'OpenAI 文档', url: 'https://example.com', chatText: true }, 'link'],
    [{ name: '普通聊天消息', chatText: true }, 'chatText'],
    [{ name: '无扩展名的本地作品', hasLocalFile: true }, 'work'],
  ] as const

  for (const [candidate, expected] of cases) {
    assert.equal(classifyArtifactCategory(candidate), expected)
  }
})
test('defines all as work, document, skill, and link while excluding chat text', () => {
  assert.deepEqual(
    (['work', 'document', 'skill', 'link', 'chatText'] as const).map((category) => (
      [category, isIncludedInAll(category)]
    )),
    [
      ['work', true],
      ['document', true],
      ['skill', true],
      ['link', true],
      ['chatText', false],
    ],
  )
})

test('extracts and deduplicates structured URLs from Chinese text and application XML', () => {
  const urls = extractStructuredUrls({
    text: [
      '中文包围（https://Example.com/report?id=42），请查看。',
      '重复链接：https://example.com:443/report?id=42。',
      '另一个：https://docs.example.cn/guide#开始；结束。',
    ].join(''),
    application_xml: [
      '<appmsg>',
      '<url>https://files.example.com/download?id=7&amp;from=xml</url>',
      '<sourceurl><![CDATA[https://example.com/report?id=42]]></sourceurl>',
      '</appmsg>',
    ].join(''),
  })

  assert.deepEqual(urls, [
    'https://example.com/report?id=42',
    'https://docs.example.cn/guide#%E5%BC%80%E5%A7%8B',
    'https://files.example.com/download?id=7&from=xml',
  ])
})

test('ignores unsupported or malformed URL-like values', () => {
  assert.deepEqual(extractStructuredUrls({
    text: 'ftp://example.com/file 以及 https://[invalid',
    application_xml: '<url>javascript:alert(1)</url>',
  }), [])
})
