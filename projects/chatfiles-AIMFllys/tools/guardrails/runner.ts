import type { ArchitectureBaseline } from './architecture.js'
import { inspectArchitecture } from './architecture.js'
import type { RepositoryBaseline } from './repository.js'
import {
  inspectPrivacyPaths,
  inspectSourceSizes,
  inspectUtf8Files,
  listGitCandidateFiles,
} from './repository.js'

export type GuardrailCheck = 'all' | 'architecture' | 'privacy' | 'source-size' | 'utf8'

export interface GuardrailBaseline {
  architecture: ArchitectureBaseline
  repository: RepositoryBaseline
}

interface GuardrailRunOptions {
  baseline: GuardrailBaseline
  candidateFiles?: string[]
  root: string
  write?: (message: string) => void
}

interface GuardrailDiagnostic {
  message: string
}

function repositoryCandidates(options: GuardrailRunOptions) {
  return options.candidateFiles ?? listGitCandidateFiles(options.root)
}

function inspectCheck(
  check: Exclude<GuardrailCheck, 'all'>,
  options: GuardrailRunOptions,
): GuardrailDiagnostic[] {
  const candidates = repositoryCandidates(options)
  if (check === 'architecture') {
    return inspectArchitecture(options.root, options.baseline.architecture, candidates).issues
  }
  if (check === 'source-size') return inspectSourceSizes(options.root, candidates, options.baseline.repository)
  if (check === 'utf8') return inspectUtf8Files(options.root, candidates, options.baseline.repository)
  return inspectPrivacyPaths(candidates)
}

export function runGuardrailCheck(check: GuardrailCheck, options: GuardrailRunOptions) {
  const checks: Array<Exclude<GuardrailCheck, 'all'>> = check === 'all'
    ? ['architecture', 'source-size', 'utf8', 'privacy']
    : [check]
  const issues: GuardrailDiagnostic[] = checks.flatMap((candidate) => inspectCheck(candidate, options))
  const write = options.write ?? console.log

  if (issues.length === 0) {
    write(`[guardrails:${check}] ok`)
    return 0
  }

  write(`[guardrails:${check}] ${issues.length} issue(s)`)
  for (const issue of issues) write(`- ${issue.message}`)
  return 1
}
