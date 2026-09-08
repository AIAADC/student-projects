import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

type TsConfig = {
  compilerOptions?: Record<string, unknown>
  extends?: string
  include?: string[]
  references?: Array<{ path: string }>
}

type PackageJson = { scripts?: Record<string, string> }

const root = path.resolve(import.meta.dirname, '..', '..')

function readJson(relativePath: string): TsConfig {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')) as TsConfig
}

test('all runtime layers have strict TypeScript projects in the build graph', () => {
  const expectedProjects = [
    'tsconfig.app.json',
    'tsconfig.e2e.json',
    'tsconfig.node.json',
    'tsconfig.pipeline.json',
    'tsconfig.server.json',
    'tsconfig.shared.json',
  ]
  const rootConfig = readJson('tsconfig.json')

  assert.deepEqual(
    rootConfig.references?.map((reference) => reference.path).sort(),
    expectedProjects.map((project) => `./${project}`).sort(),
  )

  const base = readJson('tsconfig.base.json')
  assert.equal(base.compilerOptions?.strict, true)
  assert.equal(base.compilerOptions?.noEmit, true)

  for (const project of expectedProjects) {
    const config = readJson(project)
    assert.equal(config.extends, './tsconfig.base.json', `${project} must extend the strict base`)
  }

  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as PackageJson
  for (const script of ['typecheck', 'typecheck:client', 'typecheck:e2e', 'typecheck:pipeline', 'typecheck:server', 'typecheck:shared']) {
    assert.equal(typeof packageJson.scripts?.[script], 'string', `package.json must expose ${script}`)
  }
  assert.match(packageJson.scripts?.test ?? '', /pipeline\/\*\*\/\*\.test\.ts/u)
  assert.match(JSON.stringify(readJson('tsconfig.pipeline.json')), /pipeline\/\*\*\/\*\.ts/u)
})

test('guardrail tools have a strict automated TypeScript project', () => {
  const config = readJson('tools/guardrails/tsconfig.json')
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
  ) as PackageJson

  assert.equal(config.extends, '../../tsconfig.base.json')
  assert.deepEqual(config.compilerOptions?.types, ['node'])
  assert.deepEqual(config.include, ['./*.ts'])
  assert.equal(packageJson.scripts?.['typecheck:guardrails'], 'tsc -p tools/guardrails/tsconfig.json')
  assert.match(packageJson.scripts?.typecheck ?? '', /typecheck:guardrails/u)
})

test('eslint declares browser and node globals in separate file scopes', () => {
  const source = fs.readFileSync(path.join(root, 'eslint.config.js'), 'utf8')

  assert.match(source, /files:\s*\['src\/\*\*\/\*\.\{ts,tsx\}'\]/u)
  assert.match(source, /globals:\s*globals\.browser/u)
  assert.match(source, /files:\s*\['\{pipeline,server,scripts,tools\}\/\*\*\/\*\.ts'/u)
  assert.match(source, /globals:\s*globals\.node/u)
})
