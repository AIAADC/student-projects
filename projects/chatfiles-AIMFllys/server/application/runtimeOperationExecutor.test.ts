import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import type { AgentRequestConfig } from '../../shared/contracts/aiAgent.js'
import { dataCatalogStatusSchema, dataProductStatusSchema } from '../../shared/contracts/dataStatus.js'
import { OperationExecutionError } from './operationExecutor.js'
import { createRuntimeOperationExecutor } from './runtimeOperationExecutor.js'

const config: AgentRequestConfig = {
  baseURL: 'http://127.0.0.1', apiKey: '', model: 'test', temperature: 0,
  contextWindow: 8_000, contextStrategy: 'recent',
  embedding: {
    enabled: false, baseURL: 'http://127.0.0.1', apiKey: '', model: 'disabled',
    dimensions: 1, batchSize: 1,
  },
}

function chatDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE conversations(
    id TEXT PRIMARY KEY,display TEXT,is_group INTEGER,msg_count INTEGER,text_count INTEGER,
    first_time INTEGER,last_time INTEGER
  ); INSERT INTO conversations VALUES('conv-a','中文会话',0,1,1,100,100);`)
  return db
}

test('opens only catalog capabilities and preserves chat when Assets is unavailable', async () => {
  let chatOpens = 0
  let assetOpens = 0
  const fingerprint = `sha256:${'a'.repeat(64)}`
  const active = { status: { products: { wechat: { fingerprint } } } }
  const executor = createRuntimeOperationExecutor({
    projectRoot: 'X:/virtual-project', config,
    adapters: {
      readActive: (() => active) as never,
      openWechat: (() => {
        chatOpens += 1
        return { db: chatDatabase(), active }
      }) as never,
      openArtifacts: (() => {
        assetOpens += 1
        return { db: null, active, bundleRoot: null }
      }) as never,
    },
  })

  assert.deepEqual(await executor.execute('list_conversations', {}), {
    conversations: [{
      id: 'conv-a', display: '中文会话', isGroup: false, messageCount: 1,
      textCount: 1, firstTime: 100, lastTime: 100,
    }],
  })
  assert.equal(chatOpens, 1)
  assert.equal(assetOpens, 0)

  await assert.rejects(
    executor.execute('search_artifacts', {}),
    (error: unknown) => error instanceof OperationExecutionError
      && error.code === 'unavailable' && error.dependency === 'assets',
  )
  assert.equal(chatOpens, 2)
  assert.equal(assetOpens, 1)

  await executor.execute('list_conversations', {})
  assert.equal(chatOpens, 3)
  assert.equal(assetOpens, 1)
})

test('status softly probes both capabilities instead of trusting catalog readiness', async () => {
  let chatOpens = 0
  let assetOpens = 0
  const ready = dataProductStatusSchema.parse({
    schemaVersion: 2, runId: 'run-ready', fingerprint: `sha256:${'a'.repeat(64)}`,
    state: 'ready', counts: {}, issues: [],
  })
  const active = {
    status: {
      catalog: dataCatalogStatusSchema.parse({ state: 'ready', previous: 'missing', transactionId: null }),
      products: { wechat: ready, assets: ready, library: ready, insights: ready },
    },
  }
  const executor = createRuntimeOperationExecutor({
    projectRoot: 'X:/virtual-project', config,
    adapters: {
      readActive: (() => active) as never,
      openWechat: (() => { chatOpens += 1; return { db: null, active } }) as never,
      openArtifacts: (() => { assetOpens += 1; return { db: null, active, bundleRoot: null } }) as never,
    },
  })
  const status = await executor.execute('status', {}) as { wechat: string; artifacts: string }
  assert.equal(status.wechat, 'unavailable')
  assert.equal(status.artifacts, 'unavailable')
  assert.equal(chatOpens, 1)
  assert.equal(assetOpens, 1)
})
