import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('defines one reusable gradient-free midnight reading mark', () => {
  const sourcePath = path.resolve(process.cwd(), 'src/components/brand/BrandMark.tsx')
  const geometryPath = path.resolve(process.cwd(), 'src/components/brand/brandGeometry.ts')
  assert.equal(fs.existsSync(sourcePath), true)
  assert.equal(fs.existsSync(geometryPath), true)
  const source = fs.readFileSync(sourcePath, 'utf8')
  const geometry = fs.readFileSync(geometryPath, 'utf8')
  assert.match(source, /from '\.\/brandGeometry'/u)
  assert.match(geometry, /export const brandMarkViewBox = '0 0 64 64'/u)
  assert.match(geometry, /export const brandMarkPaths/u)
  assert.doesNotMatch(`${source}\n${geometry}`, /(?:linear|radial)Gradient/u)
  assert.match(source, /aria-label=\{title\}/u)
  assert.equal(fs.existsSync(path.resolve(process.cwd(), 'src/assets/vite.svg')), false)
})
