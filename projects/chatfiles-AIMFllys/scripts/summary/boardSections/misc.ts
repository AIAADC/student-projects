import type { ChatSummary } from '../../../shared/contracts/index.js'
import type { SummaryContext } from '../types.js'
import { formatMb } from '../utils.js'

export function buildMiscBoards(ctx: SummaryContext): ChatSummary['boards'] {
  const {
    manifest,
    textExtracts,
    textEvidence,
    valuableTextExtracts,
    forecast,
    byPreview,
    bySourcePreview,
    downloadByExt,
    downloadByName,
  } = ctx

  return [
    {
      id: 'text-insights',
      title: '可读文本与关键信息',
      scope: '文本记录 / 附件',
      priority: textExtracts.length ? 'medium' : 'high',
      tags: ['总结', '文本', '关键线索'],
      evidence: textExtracts.map((item) => item.archivePath ?? item.sourcePath),
      content: `## 可直接读取的文本证据

${textEvidence}

## 关键内容候选

${valuableTextExtracts.length
  ? valuableTextExtracts.map((item) => `- ${item.title}：${item.signals.join('、')}`).join('\n')
  : '- 当前可读文本更像词库/程序资源，不足以作为聊天思想或技术内容总结依据。'}

## 提炼方式

这里不会把文件名当作聊天原文；只有可用 UTF-8 读取的归档文本才进入“文本证据”。聊天数据库正文尚未解开时，本页把“已读证据”和“还不能读的正文”分开呈现，避免凭空编造群/人物总结。`,
    },
    {
      id: 'academic-synthesis',
      title: '学业资料与下学期行动图',
      scope: (process.env.OWNER_IDENTITY || '学业').trim(),
      priority: 'high',
      tags: ['学业', '课程', '下学期'],
      evidence: ['data/course-plan.json', ...manifest.files.filter((file) => file.category === '学业').map((file) => file.archivePath)],
      content: `## 下学期课程

${forecast
  .map((course) => `- ${course.name}：${course.credits} 学分${course.examDate ? `，考试 ${course.examDate}` : ''}`)
  .join('\n')}

## 文件侧线索

${manifest.files
  .filter((file) => file.category === '学业')
  .map((file) => `- ${file.name}：${file.sourceApp} / ${file.subcategory.join(' / ')}`)
  .join('\n') || '- 当前聊天附件中学业类文件较少；课程结构主要来自 newgpa 页面。'}
`,
    },
    {
      id: 'format-coverage',
      title: '右侧渲染能力覆盖',
      scope: '文件预览',
      priority: 'medium',
      tags: ['预览', '富文本', '格式'],
      evidence: ['src/App.tsx', 'server/index.ts'],
      content: `## 归档副本预览类型统计

${Object.entries(byPreview)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([preview, count]) => `- ${preview}：${count} 个`)
  .join('\n')}

## 全量源文件预览类型统计

${Object.entries(bySourcePreview)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([preview, count]) => `- ${preview}：${count} 个`)
  .join('\n')}

## 下载兜底前线

这些仍会走通用文件头/可见字符串检查；不是遗漏，而是暂未找到安全可靠的浏览器内部渲染方式。

### 按扩展名

${downloadByExt
  .slice(0, 12)
  .map((item) => `- ${item.ext}：${item.count.toLocaleString()} 个，${formatMb(item.bytes)}`)
  .join('\n')}

### 按文件名

${downloadByName
  .slice(0, 12)
  .map((item) => `- ${item.name}：${item.count.toLocaleString()} 个，${formatMb(item.bytes)}`)
  .join('\n')}

### 本轮处理

- LevelDB/Chromium 元数据：LOG、LOG.old、CURRENT、MANIFEST-* 改为文本预览，方便查看缓存目录状态。
- xwechat/FinderLive shader：.effect 改为代码预览，右侧可高亮查看。
- WeMail mail_1/plain_1 抽样为加密或压缩载荷，继续保留通用只读检查，避免把乱码伪装成正文。

## 已支持

图片/ICO/APNG/AVIF/SVG、视频、浏览器可播音频、AMR/SILK 语音只读转码尝试、字体样张、PDF、DOCX、表格/CSV、Markdown、代码/Lua/shader、HTML、JSON、配置/证书/LevelDB 元数据文本、ZIP/7z/RAR 压缩包内部目录探测、PPTX 每页可抽取文字预览、SQLite/数据库文件只读结构探测、未知/下载类文件头与可见字符串检查。语音转码失败时仍保留归档副本、下载入口和通用检查。`,
    },
  ]
}
