import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const source = fs.readFileSync(path.resolve(process.cwd(), 'server/services/localAccessRuntime.ts'), 'utf8')
const executorSource = fs.readFileSync(
  path.resolve(process.cwd(), 'server/application/runtimeOperationExecutor.ts'), 'utf8',
)

test('binds derived search health and queries to the active WeChat product fingerprint', () => {
  assert.match(executorSource, /const active = adapters\.readActive\(options\.projectRoot\)/u)
  assert.match(executorSource, /inspectSearchIndexStatus\([\s\S]*active\.status\.products\.wechat\.fingerprint/u)
  assert.match(executorSource, /sourceFingerprint:\s*fingerprint/u)
  assert.doesNotMatch(executorSource, /sourceFileIdentity|wechatSourceFingerprint/u)
})

test('delegates per-operation resource opening without a joint Chat and Assets gate', () => {
  assert.match(source, /createRuntimeOperationExecutor/u)
  assert.doesNotMatch(source, /openCatalogArtifactDatabase|openCatalogWechatDatabase/u)
  assert.doesNotMatch(source, /!wechat\.db\s*\|\|\s*!artifacts\.db/u)
})
