import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/boards-insights.css'), 'utf8')

test('insight workspace collapses to one bounded column on narrow viewports', () => {
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.ins\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u)
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.ins-main\s*\{[\s\S]*?min-width:\s*0/u)
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.ins-cats\s*\{[\s\S]*?overflow-x:\s*auto/u)
  assert.match(css, /@media \(max-width: 980px\)[\s\S]*?\.ins \.nugget-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/u)
})
