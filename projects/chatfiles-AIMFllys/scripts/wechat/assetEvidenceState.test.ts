import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAssetEvidenceState,
  type AssetMaterializationStatus,
  type AssetPreviewStatus,
} from './assetEvidence.js'
test('keeps materialization evidence separate from browser preview capability', () => {
  assert.deepEqual(createAssetEvidenceState(
    'unsupported_codec',
    'unavailable',
    '浏览器不支持 SILK 编码',
  ), {
    materialization: 'unsupported_codec',
    preview: 'unavailable',
    reason: '浏览器不支持 SILK 编码',
  })
  assert.deepEqual(createAssetEvidenceState('thumbnail_only', 'thumbnail_only'), {
    materialization: 'thumbnail_only',
    preview: 'thumbnail_only',
  })
})
test('models every required failure status on the appropriate evidence axis', () => {
  const failurePairs = [
    ['not_attempted', 'unavailable'],
    ['key_unavailable', 'unavailable'],
    ['source_missing', 'unavailable'],
    ['cdn_only', 'unavailable'],
    ['decrypt_failed', 'unavailable'],
    ['unsupported_codec', 'unavailable'],
  ] as const satisfies readonly (readonly [AssetMaterializationStatus, AssetPreviewStatus])[]

  for (const [materialization, preview] of failurePairs) {
    assert.deepEqual(createAssetEvidenceState(materialization, preview, `原因：${preview}`), {
      materialization,
      preview,
      reason: `原因：${preview}`,
    })
  }
})

test('requires a nonempty reason for every export or preview failure state', () => {
  const failurePairs = [
    ['not_attempted', 'unavailable'],
    ['key_unavailable', 'unavailable'],
    ['source_missing', 'unavailable'],
    ['cdn_only', 'unavailable'],
    ['decrypt_failed', 'unavailable'],
    ['unsupported_codec', 'unavailable'],
  ] as const satisfies readonly (readonly [AssetMaterializationStatus, AssetPreviewStatus])[]

  for (const [materialization, preview] of failurePairs) {
    assert.throws(
      () => createAssetEvidenceState(materialization, preview),
      new RegExp(`A nonempty reason is required for ${materialization}/${preview}`),
    )
    assert.throws(
      () => createAssetEvidenceState(materialization, preview, '   '),
      new RegExp(`A nonempty reason is required for ${materialization}/${preview}`),
    )
  }
})

test('keeps successful and capability-only states free of failure reasons', () => {
  const successPairs = [
    ['ready', 'ready'],
    ['ready', 'unavailable'],
    ['thumbnail_only', 'thumbnail_only'],
  ] as const satisfies readonly (readonly [AssetMaterializationStatus, AssetPreviewStatus])[]

  for (const [materialization, preview] of successPairs) {
    assert.equal('reason' in createAssetEvidenceState(materialization, preview), false)
    assert.throws(
      () => createAssetEvidenceState(materialization, preview, '不应存在的原因'),
      new RegExp(`A reason is not allowed for ${materialization}/${preview}`),
    )
  }
})

test('rejects impossible materialization and preview status combinations', () => {
  const invalidPairs = [
    ['source_missing', 'ready'],
    ['thumbnail_only', 'unavailable'],
    ['not_attempted', 'ready'],
  ] as const satisfies readonly (readonly [AssetMaterializationStatus, AssetPreviewStatus])[]

  for (const [materialization, preview] of invalidPairs) {
    assert.throws(
      () => createAssetEvidenceState(materialization, preview),
      new RegExp(`Invalid asset evidence state: ${materialization} cannot use ${preview}`),
    )
  }
})

test('accepts every supported successful or degraded preview combination', () => {
  const validPairs = [
    ['ready', 'ready', undefined],
    ['ready', 'unavailable', undefined],
    ['thumbnail_only', 'thumbnail_only', undefined],
    ['not_attempted', 'unavailable', '尚未物化'],
    ['key_unavailable', 'unavailable', '密钥不可用'],
    ['source_missing', 'unavailable', '源文件不存在'],
    ['cdn_only', 'unavailable', '仅有远程引用'],
    ['decrypt_failed', 'unavailable', '解密失败'],
    ['unsupported_codec', 'unavailable', '不支持的编码'],
  ] as const satisfies readonly (readonly [
    AssetMaterializationStatus,
    AssetPreviewStatus,
    string | undefined,
  ])[]

  for (const [materialization, preview, reason] of validPairs) {
    const state = createAssetEvidenceState(materialization, preview, reason)
    assert.equal(state.materialization, materialization)
    assert.equal(state.preview, preview)
    assert.equal('reason' in state ? state.reason : undefined, reason)
  }
})
