import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { createWechatRouter, type WechatRouterDependencies } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('serves global and conversation collections and strictly validates query parameters', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.addAsset({ name: '中文资料.pdf', preview: 'pdf', content: 'pdf' })
  fixtureData.addAsset({ name: 'global.docx', preview: 'docx', content: 'doc', convId: null })
  const router = createWechatRouter(fixtureData.dependencies)

  await withServer(router, async (baseUrl) => {
    const global = await fetch(`${baseUrl}/api/wechat/artifacts?tab=all&q=%E4%B8%AD%E6%96%87&limit=60&offset=0`)
    assert.equal(global.status, 200)
    assert.equal(global.headers.get('cache-control'), 'private, no-store')
    assert.equal(global.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(global.headers.get('x-content-type-options'), 'nosniff')
    const globalBody = await global.json() as { counts: { all: number; chatText: number }; matchingTotal: number }
    assert.deepEqual(globalBody, { ...globalBody, matchingTotal: 1 })
    assert.equal(globalBody.counts.all, 2)
    assert.equal(globalBody.counts.chatText, 1)

    const conversation = await fetch(`${baseUrl}/api/wechat/conversation/conv-a/artifacts?tab=all`)
    assert.equal(conversation.status, 200)
    assert.equal((await conversation.json() as { counts: { all: number } }).counts.all, 1)

    for (const query of [
      'tab=other', 'collection=other', 'collection=library&collection=outputs',
      'limit=0', 'limit=201', 'limit=1.5', 'offset=-1', `q=${'x'.repeat(201)}`,
    ]) {
      const response = await fetch(`${baseUrl}/api/wechat/artifacts?${query}`)
      assert.equal(response.status, 400, query)
      assert.deepEqual(Object.keys(await response.json()).sort(), ['code', 'error'])
    }

    assert.equal((await fetch(`${baseUrl}/api/wechat/artifacts?offset=3`)).status, 416)
    const empty = await fetch(`${baseUrl}/api/wechat/artifacts?offset=2`)
    assert.equal(empty.status, 200)
    assert.deepEqual((await empty.json() as { items: unknown[] }).items, [])
  })
})

test('leases WeChat and assets from one product snapshot for a combined collection request', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.addAsset({ content: 'ready' })
  let combinedLeases = 0
  const dependencies = {
    ...fixtureData.dependencies,
    openWechatDatabase: () => { throw new Error('separate WeChat lease used') },
    openArtifactDatabase: () => { throw new Error('separate asset lease used') },
    openProductDatabases: () => {
      combinedLeases++
      return {
        wechat: { db: fixtureData.wechatDb,release() {} },
        artifacts: { db: fixtureData.assetDb,release() {} },
      }
    },
  }
  await withServer(createWechatRouter(dependencies), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifacts`)).status, 200)
  })
  assert.equal(combinedLeases, 1)
})

test('serves a distinct ready-only library collection with coherent pagination', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.addAsset({ name: '可预览.pdf', preview: 'pdf', content: 'ready' })
  fixtureData.addAsset({
    name: '待解密.pdf', preview: 'pdf', materialization: 'decrypt_failed', previewStatus: 'decrypt_failed',
  })
  fixtureData.addAsset({ name: '全局可预览.docx', preview: 'docx', content: 'ready', convId: null })

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const library = await fetch(`${baseUrl}/api/wechat/artifacts?collection=library&tab=all`)
    assert.equal(library.status, 200)
    const body = await library.json() as {
      counts: { all: number; document: number; chatText: number }
      matchingTotal: number
      items: Array<{ name: string }>
    }
    assert.deepEqual(body.counts, {
      all: 2, work: 0, document: 2, skill: 0, link: 0, chatText: 0,
    })
    assert.equal(body.matchingTotal, 2)
    assert.deepEqual(body.items.map((item) => item.name), ['可预览.pdf', '全局可预览.docx'])

    const text = await fetch(`${baseUrl}/api/wechat/artifacts?collection=library&tab=chatText`)
    assert.equal(text.status, 200)
    assert.deepEqual(await text.json(), {
      runId: 'legacy', timeZone: 'Asia/Shanghai',tab: 'chatText',
      counts: { all: 2, work: 0, document: 2, skill: 0, link: 0, chatText: 0 },
      total: 0, matchingTotal: 0, offset: 0, limit: 60, items: [],
    })
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifacts?collection=library&offset=2`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifacts?collection=library&offset=3`)).status, 416)
  })
})

test('preserves conversation discovery but removes the unconsumed legacy messages endpoint', async (t) => {
  const fixtureData = fixture(t)
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const conversations = await fetch(`${baseUrl}/api/wechat/conversations`)
    assert.equal(conversations.status, 200)
    assert.equal(
      (await conversations.json() as { conversations: Array<{ display: string }> }).conversations[0]?.display,
      '测试会话',
    )

    const messages = await fetch(`${baseUrl}/api/wechat/conversation/conv-a/messages`)
    assert.equal(messages.status, 404)
  })
})

test('returns generic 404 and 503 responses for missing conversations and databases', async (t) => {
  const fixtureData = fixture(t)
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const missingConversation = await fetch(`${baseUrl}/api/wechat/conversation/absent/artifacts`)
    assert.equal(missingConversation.status, 404)
    assert.deepEqual(await missingConversation.json(), { error: 'Request failed', code: 'not_found' })
  })

  const unavailable: WechatRouterDependencies = {
    ...fixtureData.dependencies,
    openArtifactDatabase: () => ({ db: null, release() {} }),
    openProductDatabases: () => ({
      wechat: { db: fixtureData.wechatDb,release() {} },
      artifacts: { db: null,release() {} },
    }),
  }
  await withServer(createWechatRouter(unavailable), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wechat/artifacts`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'database_unavailable' })
  })
})

test('keeps metadata path-free but returns 503 content when source configuration is unavailable', async (t) => {
  const fixtureData = fixture(t)
  const id = fixtureData.addAsset({ name: 'ready.pdf', preview: 'pdf', content: 'ready' })
  const dependencies: WechatRouterDependencies = {
    ...fixtureData.dependencies,
    accountRootProvider: () => null,
  }

  await withServer(createWechatRouter(dependencies), async (baseUrl) => {
    const metadata = await fetch(`${baseUrl}/api/wechat/artifact/${id}/metadata`)
    assert.equal(metadata.status, 200)
    assert.equal((await metadata.json() as { availability: string }).availability, 'source_unavailable')

    const content = await fetch(`${baseUrl}/api/wechat/artifact/${id}/content`)
    assert.equal(content.status, 503)
    assert.deepEqual(await content.json(), { error: 'Request failed', code: 'configuration_unavailable' })
  })
})

test('maps malformed, unknown, unavailable, and unsupported content requests to safe statuses', async (t) => {
  const fixtureData = fixture(t)
  const decrypt = fixtureData.addAsset({
    relativePath: 'secret.dat', content: 'secret', materialization: 'decrypt_failed', previewStatus: 'decrypt_failed',
  })
  const link = fixtureData.addAsset({ kind: 'link', preview: 'link', relativePath: null, url: 'https://example.test' })
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/not-an-id/content`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${'f'.repeat(64)}/content`)).status, 404)

    const unavailable = await fetch(`${baseUrl}/api/wechat/artifact/${decrypt}/content`)
    assert.equal(unavailable.status, 409)
    assert.deepEqual(await unavailable.json(), {
      error: 'Request failed', code: 'source_unavailable', state: 'decrypt_failed',
    })
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${link}/content`)).status, 415)
  })
})

test('returns path-free metadata with capabilities only when the runtime source is usable', async (t) => {
  const fixtureData = fixture(t)
  const ready = fixtureData.addAsset({ name: '中文图片.png', preview: 'image', content: 'image' })
  const missing = fixtureData.addAsset({ name: 'gone.pdf', preview: 'pdf', relativePath: 'gone.pdf' })
  const link = fixtureData.addAsset({ kind: 'link', name: 'link', preview: 'link', relativePath: null, url: 'https://example.test' })

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const readyBody = await (await fetch(`${baseUrl}/api/wechat/artifact/${ready}/metadata`)).json() as {
      availability: string
      capabilities: Record<string, string>
      size: number | null
    }
    assert.equal(readyBody.availability, 'ready')
    assert.equal(readyBody.size, 5)
    assert.deepEqual(Object.keys(readyBody.capabilities).sort(), ['content', 'metadata', 'thumbnail'])
    assert.doesNotMatch(JSON.stringify(readyBody), /source_relative_path|private full text|private failure|wxid_fixture/)
    const metadataResponse = await fetch(`${baseUrl}/api/wechat/artifact/${ready}/metadata`)
    assert.equal(metadataResponse.headers.get('cache-control'), 'private, no-store')
    assert.equal(metadataResponse.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(metadataResponse.headers.get('x-content-type-options'), 'nosniff')

    const missingBody = await (await fetch(`${baseUrl}/api/wechat/artifact/${missing}/metadata`)).json() as {
      availability: string
      capabilities: Record<string, string>
    }
    assert.equal(missingBody.availability, 'source_unavailable')
    assert.deepEqual(Object.keys(missingBody.capabilities), ['metadata'])

    const linkBody = await (await fetch(`${baseUrl}/api/wechat/artifact/${link}/metadata`)).json() as {
      availability: string
      capabilities: Record<string, string>
    }
    assert.equal(linkBody.availability, 'ready')
    assert.deepEqual(Object.keys(linkBody.capabilities), ['metadata'])
  })
})

test('serves path-free inspection data for ready generic files and archives', async (t) => {
  const fixtureData = fixture(t)
  const generic = fixtureData.addAsset({
    name: 'sample.bin', preview: 'download', content: 'visible artifact content',
  })
  const zip = new JSZip()
  zip.file('\u4e2d\u6587/readme.txt', 'ok')
  const zipContent = await zip.generateAsync({ type: 'nodebuffer' })
  const archive = fixtureData.addAsset({
    name: '资料.zip', preview: 'archive', relativePath: '资料.zip', content: zipContent,
  })

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const inspectionResponse = await fetch(`${baseUrl}/api/wechat/artifact/${generic}/inspect`)
    assert.equal(inspectionResponse.status, 200)
    const inspection = await inspectionResponse.json() as { path: string; headerHex: string }
    assert.equal(inspection.path, '')
    assert.match(inspection.headerHex, /^76 69 73 69 62 6c 65/u)
    assert.doesNotMatch(JSON.stringify(inspection), /chatfiles-wechat-http|wxid_fixture/u)

    const archiveResponse = await fetch(`${baseUrl}/api/wechat/artifact/${archive}/archive`)
    assert.equal(archiveResponse.status, 200)
    const archiveBody = await archiveResponse.json() as {
      path: string
      readable: boolean
      entries: Array<{ name: string }>
    }
    assert.equal(archiveBody.path, '')
    assert.equal(archiveBody.readable, true)
    assert.deepEqual(archiveBody.entries.map((entry) => entry.name), [
      '\u4e2d\u6587/', '\u4e2d\u6587/readme.txt',
    ])
    assert.doesNotMatch(JSON.stringify(archiveBody), /chatfiles-wechat-http|wxid_fixture/u)
  })
})

test('serves HTML, PDF, and SVG with hardened headers and safe dispositions', async (t) => {
  const fixtureData = fixture(t)
  const html = fixtureData.addAsset({ name: '页面\r\n测试.html', preview: 'html', relativePath: 'page.html', content: '<h1>safe</h1>' })
  const pdf = fixtureData.addAsset({ name: '报告.pdf', preview: 'pdf', relativePath: 'report.pdf', content: '%PDF fixture' })
  const svg = fixtureData.addAsset({ name: 'vector.svg', preview: 'image', relativePath: 'vector.svg', content: '<svg></svg>' })
  const text = fixtureData.addAsset({ name: '中文.txt', preview: 'text', relativePath: '中文.txt', content: '你好，世界' })

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const htmlResponse = await fetch(`${baseUrl}/api/wechat/artifact/${html}/content`)
    assert.equal(htmlResponse.status, 200)
    assert.match(htmlResponse.headers.get('content-type') ?? '', /^text\/html/u)
    assert.match(htmlResponse.headers.get('content-security-policy') ?? '', /sandbox; default-src 'none'/u)
    assert.match(htmlResponse.headers.get('content-disposition') ?? '', /^inline;/u)
    assert.doesNotMatch(htmlResponse.headers.get('content-disposition') ?? '', /[\r\n]/u)

    const pdfResponse = await fetch(`${baseUrl}/api/wechat/artifact/${pdf}/content`)
    assert.equal(pdfResponse.status, 200)
    assert.equal(pdfResponse.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(pdfResponse.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(pdfResponse.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(pdfResponse.headers.get('cache-control'), 'private, no-store')
    assert.match(pdfResponse.headers.get('content-disposition') ?? '', /^inline;.*filename\*=UTF-8''/u)

    const svgResponse = await fetch(`${baseUrl}/api/wechat/artifact/${svg}/content`)
    assert.equal(svgResponse.status, 200)
    assert.match(svgResponse.headers.get('content-disposition') ?? '', /^attachment;/u)

    const textResponse = await fetch(`${baseUrl}/api/wechat/artifact/${text}/content`)
    assert.equal(textResponse.status, 200)
    assert.equal(textResponse.headers.get('content-type'), 'text/plain; charset=utf-8')
    assert.match(textResponse.headers.get('content-disposition') ?? '', /^inline;/u)
    assert.equal(await textResponse.text(), '你好，世界')
  })
})

test('supports byte ranges and returns a generic 416 for an invalid range', async (t) => {
  const fixtureData = fixture(t)
  const id = fixtureData.addAsset({ name: 'range.pdf', preview: 'pdf', content: '0123456789' })
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const partial = await fetch(`${baseUrl}/api/wechat/artifact/${id}/content`, { headers: { Range: 'bytes=0-2' } })
    assert.equal(partial.status, 206)
    assert.equal(await partial.text(), '012')

    const invalid = await fetch(`${baseUrl}/api/wechat/artifact/${id}/content`, { headers: { Range: 'bytes=99-' } })
    assert.equal(invalid.status, 416)
    assert.equal(invalid.headers.get('content-range'), 'bytes */10')
    assert.match(invalid.headers.get('content-type') ?? '', /^application\/json/u)
    assert.equal(invalid.headers.get('content-disposition'), null)
    assert.doesNotMatch(await invalid.text(), /wxid_fixture|range\.pdf/u)
  })
})
