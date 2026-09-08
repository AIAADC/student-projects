import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('keeps retired file routers and their private resolvers out of production', () => {
  const root = path.resolve(process.cwd(), 'server')
  assert.equal(fs.existsSync(path.join(root, 'routes/files.ts')), false)
  assert.equal(fs.existsSync(path.join(root, 'routes/source-files.ts')), false)
  const helpers = fs.readFileSync(path.join(root, 'utils/helpers.ts'), 'utf8')
  assert.doesNotMatch(helpers, /resolveFile|resolveArchiveTarget|resolveSourceFile/u)
})
