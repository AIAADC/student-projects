import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sidebarSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/features/chat-library/ConversationSidebar.tsx'),
  'utf8',
)
const libraryCss = [
  'chat-library-shell.css',
  'chat-library-workspace.css',
  'chat-library-cards.css',
  'chat-library-dialog.css',
  'chat-library-responsive.css',
].map((name) => fs.readFileSync(path.resolve(process.cwd(), 'src/styles', name), 'utf8')).join('\n')

test('renders only the fixed-list virtual window with complete list semantics', () => {
  assert.match(sidebarSource, /useFixedListVirtualizer\(/u)
  assert.match(sidebarSource, /virtualWindow\.indices\.map/u)
  assert.doesNotMatch(sidebarSource, /ordered\.map\(/u)
  assert.match(sidebarSource, /role="list"/u)
  assert.match(sidebarSource, /aria-setsize=\{ordered\.length\}/u)
  assert.match(sidebarSource, /aria-posinset=\{index \+ 1\}/u)
})

test('gives each virtual conversation row a stable absolute geometry', () => {
  assert.match(libraryCss, /\.conversation-list\s*\{[\s\S]*?position:\s*relative/u)
  assert.match(libraryCss, /\.conversation-row\s*\{[\s\S]*?position:\s*absolute[\s\S]*?height:\s*68px/u)
  assert.match(sidebarSource, /transform:\s*`translateY\(\$\{index \* 70\}px\)`/u)
})
