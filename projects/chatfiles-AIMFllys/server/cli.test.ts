import assert from 'node:assert/strict'
import test from 'node:test'
import { runCli } from './cli.js'

function output() {
  let value = ''
  return { write: (chunk: string) => { value += chunk }, value: () => value }
}

test('prints stable UTF-8 JSON with a canonical valid list limit', async () => {
  const stdout = output()
  const stderr = output()
  let requested = ''
  const code = await runCli(['conversations', '--query', '中文', '--limit', '100', '--json'], {
    stdout: stdout.write, stderr: stderr.write,
    fetchImpl: async (input) => {
      requested = String(input)
      return Response.json({ conversations: [{ id: 'conv-a', display: '中文会话' }] })
    },
  })

  assert.equal(code, 0)
  assert.match(requested, /query=%E4%B8%AD%E6%96%87/u)
  assert.match(requested, /limit=100/u)
  assert.equal(JSON.parse(stdout.value()).conversations[0].display, '中文会话')
  assert.equal(stderr.value(), '')
})

test('returns exit code 2 for input errors without making a request', async () => {
  const stderr = output()
  let called = false
  const code = await runCli(['unknown-command'], {
    stdout: () => {}, stderr: stderr.write,
    fetchImpl: async () => { called = true; return Response.json({}) },
  })
  assert.equal(code, 2)
  assert.equal(called, false)
  assert.match(stderr.value(), /用法/u)

  for (const value of ['-1', '0', '101', 'NaN', 'Infinity', '1.5']) {
    called = false
    const invalid = await runCli(['conversations', '--limit', value], {
      stdout: () => {}, stderr: () => {},
      fetchImpl: async () => { called = true; return Response.json({}) },
    })
    assert.equal(invalid, 2, value)
    assert.equal(called, false, value)
  }
})

test('returns exit code 1 and a sanitized error for HTTP failures', async () => {
  const stderr = output()
  const code = await runCli(['search', '目标', '--json'], {
    stdout: () => {}, stderr: stderr.write,
    fetchImpl: async () => Response.json({ detail: 'C:\\private\\data.db', token: 'secret' }, { status: 503 }),
  })
  assert.equal(code, 1)
  assert.equal(stderr.value(), '本地接口请求失败。\n')
})

test('maps every documented read-only command to its stable local route', async () => {
  const requested: string[] = []
  const cases: string[][] = [
    ['status', '--json'],
    ['search', '目标', '--json'],
    ['artifacts', '说明', '--category', 'document', '--json'],
    ['read-document', 'a'.repeat(64), '--max-chars', '50000', '--json'],
    ['message-context', '消息-一', '--radius', '20', '--json'],
  ]
  for (const args of cases) {
    const code = await runCli(args, {
      stdout: () => {}, stderr: () => {},
      fetchImpl: async (input) => { requested.push(String(input)); return Response.json({ ok: true }) },
    })
    assert.equal(code, 0)
  }
  assert.match(requested.join('\n'), /status[\s\S]*search\?q=[\s\S]*artifacts\?q=[\s\S]*documents\/[a-f0-9]{64}\?maxChars=50000[\s\S]*messages\/%E6%B6%88%E6%81%AF-%E4%B8%80\/context\?radius=20/u)
})
