import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createWechatRouter, type WechatRouterDependencies } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('strictly normalizes thumbnail widths and serves only image or video artifacts', async (t) => {
  const fixtureData = fixture(t)
  const widths: number[] = []
  const thumbnailPath = path.join(fixtureData.root, 'thumb.webp')
  fs.writeFileSync(thumbnailPath, 'webp')
  const dependencies: WechatRouterDependencies = {
    ...fixtureData.dependencies,
    imageThumbnail: (_target, width) => {
      widths.push(width)
      return width === 496 ? path.join(fixtureData.root, 'missing-thumb.webp') : thumbnailPath
    },
    videoThumbnail: (_target, width) => { widths.push(width); return thumbnailPath },
  }
  const image = fixtureData.addAsset({ name: 'image.jpg', preview: 'image', content: 'image' })
  const video = fixtureData.addAsset({
    name: 'video.mp4',
    preview: 'video',
    content: 'video',
    materialization: 'thumbnail_only',
    previewStatus: 'thumbnail_only',
  })
  const document = fixtureData.addAsset({ name: 'doc.pdf', preview: 'pdf', content: 'pdf' })

  await withServer(createWechatRouter(dependencies), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${image}/thumbnail?w=105`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${video}/thumbnail?w=512`)).status, 200)
    const failedThumbnail = await fetch(`${baseUrl}/api/wechat/artifact/${image}/thumbnail?w=500`)
    assert.equal(failedThumbnail.status, 409)
    assert.match(failedThumbnail.headers.get('content-type') ?? '', /^application\/json/u)
    assert.equal(failedThumbnail.headers.get('content-disposition'), null)
    assert.deepEqual(widths, [112, 512, 496])
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${image}/thumbnail?w=95`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${image}/thumbnail?w=96.5`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${document}/thumbnail`)).status, 415)
  })
})
