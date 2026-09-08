import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/boards-overview.css'), 'utf8')

test('overview grids collapse inside their owning stylesheet on narrow viewports', () => {
  assert.match(css, /@media \(max-width: 1200px\)[\s\S]*?\.ov-tiles\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u)
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.ov-entries\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u)
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ov-tiles\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u)
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.ov-minor\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/u)
})
