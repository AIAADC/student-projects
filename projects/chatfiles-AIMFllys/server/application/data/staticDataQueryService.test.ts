import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createRuntimeStaticDataQueryService } from './staticDataQueryService.js'

test('distinguishes a missing optional product from corrupted JSON', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-static-data-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'data'))
  const service = createRuntimeStaticDataQueryService(root)

  assert.deepEqual(service.knowledge(), {
    generatedAt: new Date(0).toISOString(), sourceStatus: [], coursePlan: [], sections: [],
  })

  fs.writeFileSync(path.join(root, 'data', 'knowledge.json'), '{broken', 'utf8')
  assert.throws(() => service.knowledge())
})
