import path from 'node:path'

import { inspectDocumentation } from './policy.js'

const root = path.resolve(import.meta.dirname, '..', '..')
const issues = inspectDocumentation(root)
if (issues.length === 0) {
  console.log('[documentation] ok')
} else {
  console.error(`[documentation] ${issues.length} issue(s)`)
  for (const issue of issues) console.error(`- ${issue.message}`)
  process.exitCode = 1
}
