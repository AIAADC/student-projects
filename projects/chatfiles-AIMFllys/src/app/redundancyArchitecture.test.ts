import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'src')

test('keeps removed chat UI, unused style barrels, and duplicate type barrels out of production', () => {
  for (const relativePath of [
    'boards/ChatContext.tsx',
    'boards/ChatMessageList.tsx',
    'hooks/useInView.ts',
    'utils/aiContext.ts',
    'utils/chatOwnership.ts',
    'types/chatIdentity.ts',
    'styles/boards-chat.css',
    'styles/boards-chat-context.css',
    'styles/boards.css',
    'styles/ai.css',
    'styles/workbenches.css',
    'types.ts',
    'types/chat.ts',
    'types/chatLibrary.ts',
    'types/chatResearch.ts',
    'types/chatTimeline.ts',
    'types/files.ts',
    'types/insights.ts',
    'types/linkPreview.ts',
    'assets/hero.png',
    'assets/react.svg',
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, relativePath)
  }

  const chatPage = fs.readFileSync(path.join(root, 'pages/ChatPage.tsx'), 'utf8')
  assert.doesNotMatch(chatPage, /boards-chat(?:-context)?\.css/u)
  const layout = fs.readFileSync(path.join(root, 'styles/layout.css'), 'utf8')
  assert.doesNotMatch(layout, /\.chat3|\.chat-ctx/u)
})
