import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

const MODULE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'] as const
const SOURCE_LAYERS = ['shared', 'pipeline', 'src', 'server', 'scripts', 'tools'] as const

type SourceLayer = (typeof SOURCE_LAYERS)[number]

const ALLOWED_DEPENDENCIES: Record<SourceLayer, ReadonlySet<SourceLayer>> = {
  shared: new Set(['shared']),
  pipeline: new Set(['pipeline', 'shared']),
  src: new Set(['src', 'shared']),
  server: new Set(['server', 'shared']),
  scripts: new Set(['pipeline', 'scripts', 'shared']),
  tools: new Set(['tools']),
}

export interface ArchitectureBaseline {
  allowedIssueSignatures: string[]
}

export interface ArchitectureIssue {
  kind: 'baseline-stale' | 'dependency-direction' | 'cycle-edge'
  signature: string
  message: string
}

export interface ArchitectureReport {
  allIssues: ArchitectureIssue[]
  issues: ArchitectureIssue[]
}

export const EMPTY_ARCHITECTURE_BASELINE: ArchitectureBaseline = {
  allowedIssueSignatures: [],
}

function portable(candidate: string) {
  return candidate.replaceAll(path.sep, '/')
}

function walkModuleFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return []

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return walkModuleFiles(target)
    return entry.isFile() && MODULE_EXTENSIONS.includes(path.extname(entry.name) as never) ? [target] : []
  })
}

function collectModules(root: string, relativePaths?: readonly string[]) {
  if (!relativePaths) return SOURCE_LAYERS.flatMap((layer) => walkModuleFiles(path.join(root, layer)))

  return [...new Set(relativePaths)].flatMap((candidate) => {
    const normalized = portable(candidate)
    const layer = sourceLayer(normalized)
    if (!layer || !MODULE_EXTENSIONS.includes(path.extname(normalized) as never)) return []
    const absolutePath = path.resolve(root, normalized)
    const relativeToRoot = path.relative(root, absolutePath)
    if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) return []
    try {
      return fs.lstatSync(absolutePath).isFile() ? [absolutePath] : []
    } catch {
      return []
    }
  })
}

function relativeModule(root: string, absolutePath: string) {
  return portable(path.relative(root, absolutePath))
}

function sourceLayer(relativePath: string): SourceLayer | undefined {
  const firstSegment = relativePath.split('/')[0]
  return SOURCE_LAYERS.find((layer) => layer === firstSegment)
}

function resolutionCandidates(basePath: string) {
  const extension = path.extname(basePath).toLowerCase()
  const withoutExtension = extension ? basePath.slice(0, -extension.length) : basePath
  const candidates = new Set<string>([basePath])

  if (extension && MODULE_EXTENSIONS.includes(extension as never)) {
    for (const candidateExtension of MODULE_EXTENSIONS) {
      candidates.add(`${withoutExtension}${candidateExtension}`)
    }
  } else {
    for (const candidateExtension of MODULE_EXTENSIONS) {
      candidates.add(`${basePath}${candidateExtension}`)
      candidates.add(path.join(basePath, `index${candidateExtension}`))
    }
  }

  return [...candidates].map((candidate) => path.resolve(candidate))
}

function resolveImport(
  root: string,
  importer: string,
  specifier: string,
  absoluteModules: ReadonlyMap<string, string>,
) {
  let basePath: string | undefined
  if (specifier.startsWith('.')) {
    basePath = path.resolve(path.dirname(importer), specifier)
  } else {
    const alias = SOURCE_LAYERS.find((layer) => specifier === `@${layer}` || specifier.startsWith(`@${layer}/`))
    if (alias) {
      const remainder = specifier === `@${alias}` ? '' : specifier.slice(alias.length + 2)
      basePath = path.join(root, alias, remainder)
    }
  }

  if (!basePath) return undefined
  for (const candidate of resolutionCandidates(basePath)) {
    const resolved = absoluteModules.get(portable(candidate).toLowerCase())
    if (resolved) return resolved
  }
  return undefined
}

function buildGraph(root: string, relativePaths?: readonly string[]) {
  const modules = collectModules(root, relativePaths).map((file) => path.resolve(file))
  const absoluteModules = new Map(modules.map((file) => [portable(file).toLowerCase(), file]))
  const graph = new Map<string, Set<string>>()

  for (const modulePath of modules) {
    const relativePath = relativeModule(root, modulePath)
    const preprocessed = ts.preProcessFile(fs.readFileSync(modulePath, 'utf8'), true, true)
    const references = [...preprocessed.importedFiles, ...preprocessed.referencedFiles]
    const dependencies = new Set<string>()
    for (const reference of references) {
      const resolved = resolveImport(root, modulePath, reference.fileName, absoluteModules)
      if (resolved) dependencies.add(relativeModule(root, resolved))
    }
    graph.set(relativePath, dependencies)
  }

  return graph
}

function dependencyIssues(graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const issues: ArchitectureIssue[] = []
  for (const [importer, dependencies] of graph) {
    const importerLayer = sourceLayer(importer)
    if (!importerLayer) continue
    for (const dependency of dependencies) {
      const dependencyLayer = sourceLayer(dependency)
      const applicationAdapterImport = importer.startsWith('server/application/')
        && ['server/http/', 'server/routes/', 'server/services/agent/']
          .some((prefix) => dependency.startsWith(prefix))
      if (!applicationAdapterImport
        && (!dependencyLayer || ALLOWED_DEPENDENCIES[importerLayer].has(dependencyLayer))) continue
      const direction = applicationAdapterImport
        ? `server/application->${dependency.split('/').slice(0, 3).join('/')}`
        : `${importerLayer}->${dependencyLayer}`
      const signature = `dependency-direction:${direction}:${importer}->${dependency}`
      issues.push({
        kind: 'dependency-direction',
        signature,
        message: `${importer} must not import ${dependency}`,
      })
    }
  }
  return issues
}

function stronglyConnectedComponents(graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const indexByNode = new Map<string, number>()
  const lowLink = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const components: string[][] = []
  let nextIndex = 0

  const visit = (node: string) => {
    indexByNode.set(node, nextIndex)
    lowLink.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const dependency of graph.get(node) ?? []) {
      if (!indexByNode.has(dependency)) {
        visit(dependency)
        lowLink.set(node, Math.min(lowLink.get(node)!, lowLink.get(dependency)!))
      } else if (onStack.has(dependency)) {
        lowLink.set(node, Math.min(lowLink.get(node)!, indexByNode.get(dependency)!))
      }
    }

    if (lowLink.get(node) !== indexByNode.get(node)) return
    const component: string[] = []
    while (stack.length > 0) {
      const member = stack.pop()!
      onStack.delete(member)
      component.push(member)
      if (member === node) break
    }
    components.push(component)
  }

  for (const node of graph.keys()) {
    if (!indexByNode.has(node)) visit(node)
  }
  return components
}

function cycleIssues(graph: ReadonlyMap<string, ReadonlySet<string>>) {
  const issues: ArchitectureIssue[] = []
  for (const component of stronglyConnectedComponents(graph)) {
    const members = new Set(component)
    if (component.length === 1 && !graph.get(component[0]!)?.has(component[0]!)) continue
    for (const importer of component) {
      for (const dependency of graph.get(importer) ?? []) {
        if (!members.has(dependency)) continue
        const signature = `cycle-edge:${importer}->${dependency}`
        issues.push({ kind: 'cycle-edge', signature, message: `cycle contains ${importer} -> ${dependency}` })
      }
    }
  }
  return issues
}

export function inspectArchitecture(
  root: string,
  baseline: ArchitectureBaseline = EMPTY_ARCHITECTURE_BASELINE,
  relativePaths?: readonly string[],
): ArchitectureReport {
  const graph = buildGraph(path.resolve(root), relativePaths)
  const allIssues = [...dependencyIssues(graph), ...cycleIssues(graph)].sort((left, right) =>
    left.signature.localeCompare(right.signature),
  )
  const allowed = new Set(baseline.allowedIssueSignatures)
  const actual = new Set(allIssues.map((issue) => issue.signature))
  const staleBaseline = [...allowed]
    .filter((signature) => !actual.has(signature))
    .map((signature): ArchitectureIssue => ({
      kind: 'baseline-stale',
      signature: `baseline-stale:${signature}`,
      message: `architecture baseline no longer matches an existing issue: ${signature}`,
    }))
  const issues = [...allIssues.filter((issue) => !allowed.has(issue.signature)), ...staleBaseline]
    .sort((left, right) => left.signature.localeCompare(right.signature))
  return { allIssues, issues }
}
