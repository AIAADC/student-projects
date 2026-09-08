import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

import { privacyReason } from './privacyPolicy.js'
import { isSourceFile, shouldInspectAsText } from './repositoryPolicy.js'

const MAX_SOURCE_LINES = 300

export interface RepositoryBaseline {
  allowedReplacementSignatures: string[]
  oversizedLineCaps: Record<string, number>
}

export interface RepositoryIssue {
  kind: 'baseline-stale' | 'invalid-utf8' | 'privacy-path' | 'replacement-character' | 'source-size'
  path: string
  signature: string
  message: string
}

export const EMPTY_REPOSITORY_BASELINE: RepositoryBaseline = {
  allowedReplacementSignatures: [],
  oversizedLineCaps: {},
}

function portable(candidate: string) {
  return candidate.replaceAll('\\', '/').replace(/^\.\//u, '')
}

export function listGitCandidateFiles(root: string) {
  const output = execFileSync(
    'git',
    ['-c', 'core.quotepath=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'buffer' },
  )
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(output)
  return decoded.split('\0').filter(Boolean).map(portable).sort()
}

function physicalLineCount(content: Buffer) {
  if (content.length === 0) return 0
  let newlines = 0
  for (const byte of content) {
    if (byte === 0x0a) newlines += 1
  }
  return content.at(-1) === 0x0a ? newlines : newlines + 1
}

function readRegularCandidate(root: string, relativePath: string) {
  const target = path.join(root, relativePath)
  try {
    if (!fs.lstatSync(target).isFile()) return undefined
    return fs.readFileSync(target)
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return undefined
    }
    throw error
  }
}

export function inspectSourceSizes(
  root: string,
  relativePaths: readonly string[],
  baseline: RepositoryBaseline = EMPTY_REPOSITORY_BASELINE,
) {
  const issues: RepositoryIssue[] = []
  const observed = new Set<string>()
  for (const candidate of [...new Set(relativePaths.map(portable))].sort()) {
    const content = readRegularCandidate(root, candidate)
    if (!content || !isSourceFile(candidate, content)) continue
    observed.add(candidate)
    const lineCount = physicalLineCount(content)
    const baselineCap = baseline.oversizedLineCaps[candidate]
    if (baselineCap !== undefined && (lineCount <= MAX_SOURCE_LINES || lineCount < baselineCap)) {
      const action = lineCount <= MAX_SOURCE_LINES
        ? 'remove its obsolete baseline entry'
        : `lower its baseline ceiling ${baselineCap}`
      issues.push({
        kind: 'baseline-stale',
        path: candidate,
        signature: `baseline-stale:source-size:${candidate}:${baselineCap}`,
        message: `${candidate} is now ${lineCount} lines; ${action}`,
      })
      continue
    }
    if (lineCount <= MAX_SOURCE_LINES || lineCount === baselineCap) continue
    const suffix = baselineCap !== undefined ? `; baseline ceiling ${baselineCap}` : ''
    issues.push({
      kind: 'source-size',
      path: candidate,
      signature: `source-size:${candidate}:${lineCount}`,
      message: `${candidate} has ${lineCount} lines; maximum ${MAX_SOURCE_LINES}${suffix}`,
    })
  }
  for (const [candidate, baselineCap] of Object.entries(baseline.oversizedLineCaps)) {
    const normalized = portable(candidate)
    if (observed.has(normalized)) continue
    issues.push({
      kind: 'baseline-stale',
      path: normalized,
      signature: `baseline-stale:source-size:${normalized}:${baselineCap}`,
      message: `${normalized} no longer has observable oversized source debt`,
    })
  }
  return issues
}

function replacementIssues(relativePath: string, content: string) {
  const issues: RepositoryIssue[] = []
  for (const [lineIndex, lineContent] of content.split('\n').entries()) {
    const digest = crypto.createHash('sha256').update(lineContent, 'utf8').digest('hex').slice(0, 16)
    let column = 1
    for (const character of lineContent) {
      if (character === '\uFFFD') {
        const line = lineIndex + 1
        const signature = `replacement-character:${relativePath}:${line}:${column}:${digest}`
        issues.push({
          kind: 'replacement-character',
          path: relativePath,
          signature,
          message: `${relativePath} contains U+FFFD at ${line}:${column}`,
        })
      }
      column += 1
    }
  }
  return issues
}

function replacementBaselinePath(signature: string) {
  return /^replacement-character:(.*):\d+:\d+:[0-9a-f]{16}$/u.exec(signature)?.[1] ?? '<baseline>'
}

export function inspectUtf8Files(
  root: string,
  relativePaths: readonly string[],
  baseline: RepositoryBaseline = EMPTY_REPOSITORY_BASELINE,
) {
  const allowed = new Set(baseline.allowedReplacementSignatures)
  const issues: RepositoryIssue[] = []
  const actualReplacements = new Set<string>()
  for (const candidate of [...new Set(relativePaths.map(portable))].sort()) {
    if (!shouldInspectAsText(candidate)) continue
    const source = readRegularCandidate(root, candidate)
    if (!source) continue
    if (source.includes(0)) {
      issues.push({
        kind: 'invalid-utf8',
        path: candidate,
        signature: `invalid-utf8:${candidate}`,
        message: `${candidate} contains NUL bytes and is not UTF-8 text`,
      })
      continue
    }
    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(source)
    } catch {
      issues.push({
        kind: 'invalid-utf8',
        path: candidate,
        signature: `invalid-utf8:${candidate}`,
        message: `${candidate} is not valid UTF-8`,
      })
      continue
    }
    const replacements = replacementIssues(candidate, content)
    for (const issue of replacements) actualReplacements.add(issue.signature)
    issues.push(...replacements.filter((issue) => !allowed.has(issue.signature)))
  }
  for (const signature of allowed) {
    if (actualReplacements.has(signature)) continue
    const candidate = replacementBaselinePath(signature)
    issues.push({
      kind: 'baseline-stale',
      path: candidate,
      signature: `baseline-stale:${signature}`,
      message: `${candidate} no longer contains the baselined U+FFFD occurrence`,
    })
  }
  return issues
}

export function inspectPrivacyPaths(relativePaths: readonly string[]) {
  return [...new Set(relativePaths.map(portable))].sort().flatMap((candidate): RepositoryIssue[] => {
    const reason = privacyReason(candidate)
    if (!reason) return []
    return [{
      kind: 'privacy-path',
      path: candidate,
      signature: `privacy-path:${candidate}`,
      message: `${candidate} must not be tracked or offered for commit (${reason})`,
    }]
  })
}
