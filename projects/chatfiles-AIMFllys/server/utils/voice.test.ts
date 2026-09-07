import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { voiceCodecHint } from './voice.js'

test('distinguishes AMR wideband before the narrowband prefix', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-voice-hint-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const filename = path.join(root, 'voice.amr')
  fs.writeFileSync(filename, '#!AMR-WB\nfixture', 'ascii')
  assert.equal(voiceCodecHint(filename), 'AMR wideband')
})
