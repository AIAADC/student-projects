import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('persists only strict chat-library sidebar booleans', async () => {
  const modulePath = path.resolve(process.cwd(), 'src/features/chat-library/sidebarState.ts')
  assert.equal(fs.existsSync(modulePath), true)
  if (!fs.existsSync(modulePath)) return
  const state = await import('./sidebarState.js')
  assert.equal(state.parseSidebarCollapsed('true'), true)
  assert.equal(state.parseSidebarCollapsed('false'), false)
  assert.equal(state.parseSidebarCollapsed('1'), false)
  assert.equal(state.parseSidebarCollapsed('TRUE'), false)
  assert.equal(state.parseSidebarCollapsed(null), false)
  assert.equal(state.serializeSidebarCollapsed(true), 'true')
  assert.equal(state.serializeSidebarCollapsed(false), 'false')
})
