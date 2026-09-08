import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type { CourseItem, KnowledgeBase, SourceDiscovery } from '../shared/contracts/index.js'
import { dataDir, root, writeJson } from './shared.js'
import { readCurrentLibraryManifest } from './data/catalogConsumer.js'

const home = process.env.USERPROFILE ?? ''
// Owner identity label is injected locally (gitignored .env.local) — see .env.example.
const OWNER_IDENTITY = (process.env.OWNER_IDENTITY || '').trim()
const idPrefix = OWNER_IDENTITY ? `${OWNER_IDENTITY} ` : ''
const qqDb = path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_db', 'nt_msg.db')
const wechatRoam = path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'roam')

function dbStatus(filePath: string) {
  if (!fs.existsSync(filePath)) return `未找到：${filePath}`
  const header = [...fs.readFileSync(filePath).subarray(0, 40)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
  try {
    const db = new DatabaseSync(filePath, { readOnly: true })
    const tables = db.prepare("select name from sqlite_master where type='table' limit 5").all()
    db.close()
    return `可读取：${filePath}；表：${JSON.stringify(tables)}`
  } catch (error) {
    return `已定位但无法直接读取：${filePath}；文件头十六进制：${header}；错误：${String(error)}`
  }
}

const courseData = readJson<{ coursePlan: CourseItem[] }>(path.join(dataDir, 'course-plan.json'), { coursePlan: [] })
const manifest = readCurrentLibraryManifest(path.dirname(dataDir))
const discovery = readJson<SourceDiscovery>(path.join(dataDir, 'source-discovery.json'), {
  generatedAt: new Date(0).toISOString(),
  roots: [],
  directoryMap: [],
  databases: [],
  topCandidates: [],
})

const forecast = courseData.coursePlan.filter((course) => course.kind === 'forecast')
const librarySummary = manifest.files.reduce<Record<string, number>>((acc, file) => {
  acc[file.category] = (acc[file.category] ?? 0) + 1
  return acc
}, {})

const knowledge: KnowledgeBase = {
  generatedAt: new Date().toISOString(),
  sourceStatus: [
    {
      source: 'QQ NT 聊天数据库',
      status: 'blocked',
      detail: dbStatus(qqDb),
    },
    {
      source: '微信新版 xwechat roam',
      status: fs.existsSync(wechatRoam) ? 'partial' : 'blocked',
      detail: fs.existsSync(wechatRoam)
        ? `已定位：${wechatRoam}。新版微信聊天数据库目录存在，但需要微信本机密钥/官方导出或已解密数据库才能提取聊天原文。`
        : `未找到：${wechatRoam}`,
    },
    {
      source: '聊天附件文件',
      status: 'done',
      detail: `已复制归档 ${manifest.stats.archived} 个可访问文件，原始文件保留未动。`,
    },
    {
      source: '扩展数据源发现',
      status: discovery.roots.length ? 'done' : 'partial',
      detail: discovery.roots.length
        ? `已检查 ${discovery.roots.length} 个微信/QQ/企业微信候选位置，发现 ${discovery.roots.reduce((sum, item) => sum + item.candidateCount, 0)} 个可归档候选。`
        : '尚未生成 source-discovery.json。',
    },
    {
      source: `${idPrefix}课程网站`,
      status: forecast.length ? 'done' : 'partial',
      detail: forecast.length
        ? `已从 newgpa 抓取 ${forecast.length} 门下学期课程。`
        : '课程页面可打开，但未读取到本地状态数据。',
    },
  ],
  coursePlan: courseData.coursePlan,
  sections: [
    {
      id: 'chat-extraction-boundary',
      title: '聊天记录提炼状态',
      scope: '微信 / QQ',
      tags: ['聊天记录', '可操作边界', '安全'],
      content: `## 当前结论

已定位 QQ NT 数据库和新版微信 xwechat 数据目录，但聊天正文数据库无法用普通 SQLite 直接读取。为避免破坏原始记录，本项目没有修改、删除或重写任何微信/QQ原始文件。

### 已确认的位置

- QQ 文件与数据库：\`${path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq')}\`
- QQ 主消息库：\`${qqDb}\`
- 微信新版数据：\`${path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat')}\`
- 微信旧版框架数据：\`${path.join(home, 'AppData', 'Roaming', 'Tencent', 'WeChat')}\`

### 还需要的输入

要继续完成“按群/人物提炼技术、哲理、有价值内容”，需要以下任一来源：

- 微信/QQ官方导出的聊天记录；
- 已解密的数据库副本；
- 你明确授权并提供可用解密密钥/工具链。

在这些条件满足前，我不会对数据库做破坏性尝试。`,
    },
    {
      id: 'academic-next-term',
      title: `${idPrefix}下学期学习地图`,
      scope: '学业',
      tags: [...(OWNER_IDENTITY ? [OWNER_IDENTITY] : []), '下学期', '课程'],
      content: `## 下学期课程重点

${forecast
  .map((course) => {
    const weights =
      course.usualWeight != null && course.examWeight != null
        ? `平时 ${Math.round(course.usualWeight * 100)}%，期末 ${Math.round(course.examWeight * 100)}%。`
        : ''
    return `### ${course.name}

- 学分：${course.credits}
${course.examDate ? `- 考试时间：${course.examDate}` : '- 考试时间：未标注'}
- 结构：${weights || '未标注'}
${course.notes ? `- 备注：${course.notes}` : ''}
`
  })
  .join('\n')}
`,
    },
    {
      id: 'source-discovery-map',
      title: '数据源覆盖与剩余缺口',
      scope: '微信 / QQ / 企业微信',
      tags: ['数据源', '归档覆盖', '只读'],
      content: `## 已扫描的数据源

${discovery.roots
  .map(
    (item) => `### ${item.exists ? '已找到' : '未找到'}：${item.path}

- 候选文件：${item.candidateCount} 个
- 候选体积：${(item.candidateBytes / 1024 / 1024).toFixed(2)} MB
- 说明：${item.note}
`,
  )
  .join('\n')}

## 聊天数据库状态

${discovery.databases
  .map(
    (item) => `### ${item.exists ? '已定位' : '未找到'}：${item.path}

- 大小：${(item.size / 1024 / 1024).toFixed(2)} MB
- 状态：${item.readable ? '可直接读取' : '不可直接读取'}
- 细节：${item.detail}
`,
  )
  .join('\n')}

## 当前边界

附件归档已经覆盖可直接访问的图片、视频、语音、文档、表格、压缩包和代码文件；聊天正文仍受 QQ NT / xwechat 本机加密或封装限制，需要官方导出、已解密副本或明确提供可用密钥链后才能继续按群/人物做原文级提炼。`,
    },
    {
      id: 'file-taxonomy',
      title: '文件顶级分类概览',
      scope: '文件',
      tags: ['归档', '分类', '去重'],
      content: `## 分类统计

${Object.entries(librarySummary)
  .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  .map(([category, count]) => `- ${category}：${count} 个`)
  .join('\n')}

## 规则

- 一级分类包含：过去、创业、AI、树林、学业、专业、比赛、素材、未归类。
- 后续延伸板块已纳入类型系统：生活、健康、项目、财务、旅行、阅读、工具、人物。
- 次级分类按文件形态展开：聊天影像、视频、语音、文档/PDF、文档/表格、代码等。
- 同名带序号文件保留最高序号版本；完全相同内容按 SHA-256 去重。
- 本次采用复制归档，不删除原始位置。`,
    },
  ],
}

writeJson(path.join(dataDir, 'knowledge.json'), knowledge)
fs.writeFileSync(path.join(root, 'README_CHATFILES.md'), `# ChatFiles

这是一个本地微信/QQ文件与知识整理站点。

- 端口：3456
- 启动：\`npm run dev\`
- 文件索引：\`data/library.json\`
- 知识库：\`data/knowledge.json\`
- 归档文件：\`archive/\`

注意：原始聊天记录和原始文件没有被删除。本项目只复制可访问附件，并记录无法直接读取的加密/封装数据库位置。
`, 'utf8')

console.log(`Built knowledge base with ${knowledge.sections.length} sections.`)
