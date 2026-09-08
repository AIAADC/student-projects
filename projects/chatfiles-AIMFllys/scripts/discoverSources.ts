import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SourceDiscovery } from '../shared/contracts/index.js'
import { candidateRoots, dataDir, ensureDir, home, isEligibleAttachment, root, sourceApp, walkFiles, writeJson } from './shared.js'

type RootNote = {
  path: string
  note: string
}

const sourceRoots: RootNote[] = [
  { path: path.join(home, 'Documents', 'Tencent Files'), note: 'QQ 传统/NT 文件与数据库总目录，只读扫描。' },
  { path: path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_data'), note: 'QQ NT 图片、视频、语音、文件、dataline 附件。' },
  { path: path.join(home, 'AppData', 'Roaming', 'QQ'), note: '新版 QQ/Electron 应用数据、前端包、缓存、日志与旁证文件，只读纳入全量索引。' },
  { path: path.join(home, 'AppData', 'Roaming', 'Tencent'), note: '腾讯漫游数据总目录，用于确认微信/QQ/企业微信实际落点。' },
  { path: path.join(home, 'AppData', 'Local', 'Tencent'), note: '腾讯本地缓存目录候选，只读记录是否存在。' },
  { path: path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat'), note: '新版微信 xwechat 数据、roam、cdn、applet 缓存位置。' },
  { path: path.join(home, 'AppData', 'Roaming', 'Tencent', 'WeChat'), note: '旧版微信框架/插件目录；本机未发现传统 WeChat Files 聊天文件根。' },
  { path: path.join(home, 'Documents', 'WeChat Files'), note: '传统微信文件默认目录；不存在时记录为缺口。' },
  { path: path.join(home, 'AppData', 'Roaming', 'Tencent', 'WXWork'), note: '企业微信可访问文件缓存，作为补充来源归档。' },
  ...candidateRoots.map((item) => ({ path: item, note: '归档脚本实际使用的候选根目录。' })),
].filter((item, index, arr) => arr.findIndex((candidate) => candidate.path === item.path) === index)

const databases = [
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'nt_msg.db'),
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'group_msg_fts.db'),
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'buddy_msg_fts.db'),
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'files_in_chat.db'),
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'group_info.db'),
  path.join(home, 'Documents', 'Tencent Files', 'nt_qq', 'global', 'nt_db', 'login.db'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'roam'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'WeChat'),
]

function fileHeader(filePath: string) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(48)
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    return [...buffer.subarray(0, bytesRead)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
  } finally {
    fs.closeSync(fd)
  }
}

function inspectDatabase(item: string): SourceDiscovery['databases'][number] {
  if (!fs.existsSync(item)) {
    return { path: item, exists: false, size: 0, readable: false, detail: '未找到。' }
  }
  const stat = fs.statSync(item)
  if (stat.isDirectory()) {
    const files = walkFiles(item).filter((file) => /\.(db|sqlite)$/i.test(file))
    return {
      path: item,
      exists: true,
      size: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
      readable: false,
      detail: files.length
        ? `目录存在，发现 ${files.length} 个数据库候选；仍需本机密钥/官方导出后才能稳定提取聊天正文。`
        : '目录存在，但未发现可直接读取的聊天正文数据库。',
    }
  }
  try {
    const db = new DatabaseSync(item, { readOnly: true })
    const tables = db.prepare("select name from sqlite_master where type='table' limit 8").all() as Array<{ name: string }>
    db.close()
    return {
      path: item,
      exists: true,
      size: stat.size,
      readable: true,
      detail: `SQLite 可打开；表样例：${tables.map((table) => table.name).join('、') || '无表'}`,
    }
  } catch (error) {
    return {
      path: item,
      exists: true,
      size: stat.size,
      readable: false,
      detail: `已定位但普通 SQLite 不能读取；文件头：${fileHeader(item)}；错误：${String(error)}`,
    }
  }
}

function kindOf(file: string) {
  const app = sourceApp(file)
  const ext = path.extname(file).toLowerCase() || '无扩展名'
  return `${app} ${ext}`
}

function focusOf(dir: string) {
  if (/\\nt_db$/i.test(dir) || /\\roam(?:\\|$)/i.test(dir) || /\\WeChat$/i.test(dir)) return '聊天数据库/索引'
  if (/\\AppData\\Roaming\\QQ(?:\\|$)/i.test(dir) || /\\Tencent\\QQ(?:\\|$)/i.test(dir)) return 'QQ 应用数据/日志旁证'
  if (/\\WeMeet(?:\\|$)/i.test(dir)) return '腾讯会议组件'
  if (/\\Pic|\\Image|\\Thumb|\\Ori/i.test(dir)) return '聊天图片'
  if (/\\Video/i.test(dir)) return '聊天视频'
  if (/\\Ptt|\\Voice|\\Audio/i.test(dir)) return '语音'
  if (/\\File|\\dataline|download/i.test(dir)) return '文件附件'
  if (/\\xwechat/i.test(dir)) return '新版微信数据'
  if (/\\Tencent Files/i.test(dir)) return 'QQ 数据'
  if (/\\WXWork/i.test(dir)) return '企业微信数据'
  return '候选目录'
}

function summarizeDirectory(dir: string): SourceDiscovery['directoryMap'][number] {
  if (!fs.existsSync(dir)) {
    return { path: dir, exists: false, files: 0, bytes: 0, focus: focusOf(dir) }
  }
  const files = walkFiles(dir)
  let newest = 0
  let bytes = 0
  for (const file of files) {
    const stat = fs.statSync(file)
    bytes += stat.size
    newest = Math.max(newest, stat.mtimeMs)
  }
  return {
    path: dir,
    exists: true,
    files: files.length,
    bytes,
    newest: newest ? new Date(newest).toISOString() : undefined,
    focus: focusOf(dir),
  }
}

const wideTargetName = /^(Tencent Files|WeChat Files|xwechat|WXWork|WeChat|nt_qq|QQ|WeMeet|Tencent)$/i
const wideSkipName = /^(node_modules|\.git|dist|dist-ssr|cache|Cache|Code Cache|GPUCache|Service Worker|Crashpad|Temp|tmp)$/i

function discoverWideMatches(): NonNullable<SourceDiscovery['wideMatches']> {
  const baseRoots = [
    home,
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    path.join(home, 'Desktop'),
    path.join(home, 'AppData', 'Roaming'),
    path.join(home, 'AppData', 'Local'),
    path.parse(root).root,
  ].filter((item, index, arr) => item && fs.existsSync(item) && arr.indexOf(item) === index)
  const matches = new Map<string, NonNullable<SourceDiscovery['wideMatches']>[number]>()
  let inspected = 0

  for (const base of baseRoots) {
    const queue: Array<{ dir: string; depth: number }> = [{ dir: base, depth: 0 }]
    while (queue.length && inspected < 22000) {
      const current = queue.shift()
      if (!current) break
      inspected += 1
      let entries: fs.Dirent[]
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || wideSkipName.test(entry.name)) continue
        const full = path.join(current.dir, entry.name)
        const matched = wideTargetName.test(entry.name)
        if (matched && !matches.has(full.toLowerCase())) {
          const summary = summarizeDirectory(full)
          matches.set(full.toLowerCase(), {
            path: full,
            exists: summary.exists,
            files: summary.files,
            bytes: summary.bytes,
            newest: summary.newest,
            depth: current.depth + 1,
            reason: `limit-depth search from ${base}`,
            focus: summary.focus,
          })
        }
        if (current.depth < 5) queue.push({ dir: full, depth: current.depth + 1 })
      }
    }
  }

  return [...matches.values()].sort((a, b) => b.files - a.files || a.path.localeCompare(b.path, 'zh-CN')).slice(0, 80)
}

ensureDir(dataDir)

const roots = sourceRoots.map((item) => {
  const files = walkFiles(item.path).filter(isEligibleAttachment)
  return {
    path: item.path,
    exists: fs.existsSync(item.path),
    candidateCount: files.length,
    candidateBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
    note: item.note,
  }
})

const allCandidates = candidateRoots
  .flatMap((dir) => walkFiles(dir))
  .filter(isEligibleAttachment)
  .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)

const discovery: SourceDiscovery = {
  generatedAt: new Date().toISOString(),
  roots,
  directoryMap: [
    path.join(home, 'Documents', 'Tencent Files'),
    path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || '')),
    path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq'),
    path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_data'),
    path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db'),
    path.join(home, 'Documents', 'Tencent Files', 'nt_qq'),
    path.join(home, 'AppData', 'Roaming', 'QQ'),
    path.join(home, 'AppData', 'Roaming', 'Tencent'),
    path.join(home, 'AppData', 'Local', 'Tencent'),
    path.join(home, 'Documents', 'WeChat Files'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'roam'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'radium', 'users'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'WeChat'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'WXWork'),
    path.join(home, 'AppData', 'Local', 'Temp', 'WeChat Files'),
  ].map(summarizeDirectory),
  databases: databases.map(inspectDatabase),
  topCandidates: allCandidates.slice(0, 40).map((file) => ({
    path: file,
    size: fs.statSync(file).size,
    modified: fs.statSync(file).mtime.toISOString(),
    kind: kindOf(file),
  })),
  wideMatches: discoverWideMatches(),
}

writeJson(path.join(dataDir, 'source-discovery.json'), discovery)

const report = `# 微信 / QQ 数据源发现报告

生成时间：${discovery.generatedAt}

## 附件与文件位置

${discovery.roots
  .map(
    (item) =>
      `- ${item.exists ? '已找到' : '未找到'}：${item.path}
  - 候选文件：${item.candidateCount} 个，${(item.candidateBytes / 1024 / 1024).toFixed(2)} MB
  - 说明：${item.note}`,
  )
  .join('\n')}

## 聊天数据库与索引

${discovery.databases
  .map(
    (item) =>
      `- ${item.exists ? '已定位' : '未找到'}：${item.path}
  - 大小：${(item.size / 1024 / 1024).toFixed(2)} MB
  - 状态：${item.readable ? '可直接读取' : '不可直接读取'}
  - 细节：${item.detail}`,
  )
  .join('\n')}

## 全目录探索地图

${discovery.directoryMap
  .map(
    (item) =>
      `- ${item.exists ? '已找到' : '未找到'}：${item.path}
  - 重点：${item.focus}
  - 文件总数：${item.files}，总大小：${(item.bytes / 1024 / 1024).toFixed(2)} MB
  - 最新修改：${item.newest ?? '无'}`,
  )
  .join('\n')}

## 限深宽搜命中

${discovery.wideMatches?.length
  ? discovery.wideMatches
      .map(
        (item) => `- ${item.exists ? '已找到' : '未找到'}：${item.path}
  - 重点：${item.focus}
  - 文件总数：${item.files}，总大小：${(item.bytes / 1024 / 1024).toFixed(2)} MB
  - 深度：${item.depth}；来源：${item.reason}
  - 最新修改：${item.newest ?? '无'}`,
      )
      .join('\n')
  : '- 暂无额外命中。'}

## 最大候选文件

${discovery.topCandidates
  .slice(0, 15)
  .map((item) => `- ${(item.size / 1024 / 1024).toFixed(2)} MB｜${item.kind}｜${item.path}`)
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'source-discovery.md'), report, 'utf8')
console.log(report)
