import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

async function policy() {
  const target = path.resolve(process.cwd(), 'server/services/linkPreview/urlPolicy.ts')
  assert.equal(fs.existsSync(target), true)
  if (!fs.existsSync(target)) return null
  return import('./urlPolicy.js')
}

test('allows only public HTTP and HTTPS destinations', async () => {
  const urlPolicy = await policy()
  if (!urlPolicy) return
  const publicResolver = async () => ['93.184.216.34']
  assert.equal((await urlPolicy.validatePublicUrl('https://example.com/a', publicResolver))?.hostname, 'example.com')
  assert.equal(await urlPolicy.validatePublicUrl('file:///etc/passwd', publicResolver), null)
  assert.equal(await urlPolicy.validatePublicUrl('https://user:pass@example.com', publicResolver), null)
})

test('rejects literal, resolved, and IPv6 private or reserved addresses', async () => {
  const urlPolicy = await policy()
  if (!urlPolicy) return
  const publicResolver = async () => ['93.184.216.34']
  for (const value of [
    'http://127.0.0.1', 'http://10.1.2.3', 'http://169.254.1.1', 'http://192.168.1.8',
    'http://[::1]', 'http://[fc00::1]', 'http://[fe80::1]', 'http://[2001:db8::1]',
  ]) assert.equal(await urlPolicy.validatePublicUrl(value, publicResolver), null, value)
  assert.equal(await urlPolicy.validatePublicUrl('https://rebind.test', async () => ['8.8.8.8', '127.0.0.1']), null)
})
