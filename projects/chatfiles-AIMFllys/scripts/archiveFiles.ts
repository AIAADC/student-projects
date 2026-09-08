import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runArchiveRefresh } from './archiveRunner.js'
import { resolveArchiveSourceRoots } from './archiveSources.js'
import { home, root } from './shared.js'

function buildRunId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${timestamp}-${process.pid}`
}

function countByKind(items: Array<{ kind: string }>) {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  return [...counts.entries()].map(([kind, count]) => `${kind}: ${count}`).join(', ')
}

export async function archiveFilesMain() {
  const generatedAt = new Date().toISOString()
  const sourceResolution = resolveArchiveSourceRoots({ home, environment: process.env })
  const result = await runArchiveRefresh({
    projectRoot: root,
    sourceRoots: sourceResolution.roots,
    sourceIssues: sourceResolution.issues,
    runId: process.env.CHATFILES_RUN_ID?.trim() || buildRunId(),
    generatedAt,
  })

  const report = `# 微信 / QQ 文件安全刷新结果

生成时间：${generatedAt}

- 已解析本机源根：${result.sourceRoots.length}（具体路径只保存在 gitignored 数据清单中）
- 扫描源文件：${result.discovered}
- 符合归档规则：${result.eligible}
- 清单累计文件：${result.plan.manifest.stats.archived}
- 本轮新增且完成校验：${result.plan.copyOperations.length}
- 本轮复用旧哈希：${result.plan.reusedHashes.length}
- 本轮复用已有副本：${result.plan.reusedCopies.length}
- 源路径问题：${result.sourceIssues.length}${result.sourceIssues.length ? `（${countByKind(result.sourceIssues)}）` : ''}
- 旧清单/副本完整性问题：${result.plan.integrityIssues.length}${result.plan.integrityIssues.length ? `（${countByKind(result.plan.integrityIssues)}）` : ''}
- 待审核原子包：${path.relative(root, result.bundle.finalDirectory).replace(/\\/g, '/')}

安全约束：旧清单和旧副本未删除、未覆盖；新增副本使用排他复制；library.next 已通过 UTF-8、结构和 SHA-256 校验。
`
  console.log(report)
  return result
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invokedUrl === import.meta.url) {
  archiveFilesMain().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Archive refresh failed')
    process.exitCode = 1
  })
}
