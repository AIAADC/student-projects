import assert from 'node:assert/strict'
import test from 'node:test'

import { relativePathWithinRoot } from './assetEvidence.js'
test('returns a relative path only when canonical Windows paths remain within the root', () => {
  assert.deepEqual(
    relativePathWithinRoot(
      'D:\\ChatFiles\\archive',
      'd:\\chatfiles\\archive\\snapshot-01\\image.webp',
    ),
    { safe: true, relative_path: 'snapshot-01\\image.webp' },
  )

  assert.deepEqual(
    relativePathWithinRoot('D:\\ChatFiles\\archive', 'D:\\ChatFiles\\outside\\image.webp'),
    { safe: false, reason: 'outside_root' },
  )
  assert.deepEqual(
    relativePathWithinRoot('D:\\ChatFiles\\archive', 'D:\\ChatFiles\\archive-copy\\image.webp'),
    { safe: false, reason: 'outside_root' },
  )
})

test('uses canonical-target semantics so a resolved symlink escape is rejected', () => {
  const canonicalRoot = 'D:\\ChatFiles\\archive'
  const canonicalTargetAfterRealpath = 'D:\\private-source\\secret.dat'

  assert.deepEqual(relativePathWithinRoot(canonicalRoot, canonicalTargetAfterRealpath), {
    safe: false,
    reason: 'outside_root',
  })
})

test('rejects UNC, device namespace, DOS device, ADS, relative, and cross-volume paths', () => {
  const root = 'D:\\ChatFiles\\archive'
  const cases = [
    ['\\\\server\\share\\image.webp', 'unc_path'],
    ['//server/share/image.webp', 'unc_path'],
    ['\\\\?\\D:\\ChatFiles\\archive\\image.webp', 'device_path'],
    ['\\\\.\\PhysicalDrive0', 'device_path'],
    ['D:\\ChatFiles\\archive\\NUL.txt', 'device_path'],
    ['D:\\ChatFiles\\archive\\image.webp:Zone.Identifier', 'alternate_data_stream'],
    ['archive\\image.webp', 'path_not_absolute'],
    ['E:\\ChatFiles\\archive\\image.webp', 'outside_root'],
  ] as const

  for (const [target, reason] of cases) {
    assert.deepEqual(relativePathWithinRoot(root, target), { safe: false, reason }, target)
  }
})
