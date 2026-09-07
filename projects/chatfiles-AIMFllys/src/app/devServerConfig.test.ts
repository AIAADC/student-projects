import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const viteConfig = fs.readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>
}

test('uses a dedicated Vite HMR port and proxies API calls to Express', () => {
  assert.match(viteConfig, /server:\s*\{[\s\S]*?port:\s*5173/u)
  assert.match(viteConfig, /proxy:\s*\{[\s\S]*?['"]\/api['"]:\s*['"]http:\/\/127\.0\.0\.1:3456['"]/u)
  assert.doesNotMatch(viteConfig, /preview:\s*\{[\s\S]*?port:\s*3456/u)
  assert.match(packageJson.scripts?.['dev:vite'] ?? '', /--port 5173/u)
  assert.match(packageJson.scripts?.preview ?? '', /--port 4173/u)
})
