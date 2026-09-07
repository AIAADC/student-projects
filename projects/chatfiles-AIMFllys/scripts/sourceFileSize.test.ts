import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const LIMITED_EXTENSIONS = new Set(['.css', '.ts', '.tsx'])
const MAX_LINES = 300

function physicalLineCount(content: string) {
  const withoutFinalNewline = content.replace(/\r?\n$/u, '')
  return withoutFinalNewline ? withoutFinalNewline.split(/\r?\n/u).length : 0
}

test('tracked TypeScript and CSS source files stay within the 300-line boundary', () => {
  const trackedFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'scripts', 'server', 'src'],
    { encoding: 'utf8' },
  )
    .split(/\r?\n/u)
    .filter(Boolean)
    .filter((file) => LIMITED_EXTENSIONS.has(path.extname(file).toLowerCase()))

  const oversized = trackedFiles.flatMap((file) => {
    if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) return []
    const lines = physicalLineCount(fs.readFileSync(file, 'utf8'))
    return lines > MAX_LINES ? [`${file}: ${lines}`] : []
  })

  assert.deepEqual(oversized, [])
})
