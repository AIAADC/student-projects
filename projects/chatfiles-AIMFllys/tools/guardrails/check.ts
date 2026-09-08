import path from 'node:path'

import { GUARDRAIL_BASELINE } from './baseline.js'
import { runGuardrailCheck, type GuardrailCheck } from './runner.js'

const CHECK_NAMES = new Set<GuardrailCheck>(['all', 'architecture', 'privacy', 'source-size', 'utf8'])
const requested = process.argv[2] ?? 'all'
const root = path.resolve(import.meta.dirname, '..', '..')

if (!CHECK_NAMES.has(requested as GuardrailCheck)) {
  console.error(`unknown guardrail check: ${requested}`)
  process.exitCode = 2
} else {
  process.exitCode = runGuardrailCheck(requested as GuardrailCheck, {
    baseline: GUARDRAIL_BASELINE,
    root,
  })
}
