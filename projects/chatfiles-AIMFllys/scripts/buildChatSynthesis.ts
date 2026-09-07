import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ChatClueDossier, ChatClueGroup, ChatSynthesis, ChatSynthesisItem, ChatSynthesisSection } from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'

const dossier = JSON.parse(fs.readFileSync(path.join(dataDir, 'chat-clue-dossier.json'), 'utf8')) as ChatClueDossier

const technicalPattern = /AI|技术|接口|代码|模型|算法|开发|架构|配置|api|prompt|llm|openai|claude|python|typescript|react/i
const academicPattern = /学业|学习|课程|作业|考试|复习|基医|强基|医学|生物|化学|物理|高数|英语|思政|实验|资料|StudySolo/i
const philosophyPattern = /哲理|方法|认知|复盘|原则|选择|长期|价值|意义|成长|判断|情绪|自律|行动|计划|目标/i
const platformPattern = /会议|日程|平台线索|缓存|数据库|索引|日志|WebView|wemeet|meeting/i

function stableId(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 20)
}

function nameFromPath(value: string) {
  return value.split(/[\\/]+/).filter(Boolean).at(-1) ?? value
}

function textOf(group: ChatClueGroup) {
  return `${group.signals.join(' ')}\n${group.verdict}\n${group.excerpts.join('\n')}\n${group.path}`
}

function compactExcerpt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 320)
}

function itemFor(group: ChatClueGroup, sectionId: string): ChatSynthesisItem {
  const title = group.sourceType === '聊天导出' ? nameFromPath(group.path) : `${nameFromPath(group.path)} · ${group.sourceApp}`
  const confirmed = group.sourceType === '聊天导出'
  const scope = confirmed ? '已确认聊天导出' : `${group.sourceType} / ${group.sourceApp}`
  const summary = confirmed
    ? `该组来自聊天导出，可作为人物/群组正文整理入口。当前命中 ${group.snippetCount} 段高价值内容，信号包括：${group.signals.join('、') || '未标注'}。`
    : `该组不是完整聊天正文，而是从 ${group.sourceType} 中抽出的可见线索。它适合用于技术、学业或事实线索复核，但不能冒充完整对话。当前判断：${group.verdict}`
  return {
    id: stableId(`${sectionId}:${group.id}`),
    title,
    scope,
    value: group.value,
    sourceType: group.sourceType,
    sourceApp: group.sourceApp,
    signals: group.signals,
    summary,
    next: confirmed ? '继续按人物/群组提炼主题、决策、资料和待办。' : group.next,
    evidencePath: group.path,
    excerpts: group.excerpts.map(compactExcerpt).filter(Boolean).slice(0, 5),
  }
}

function selectGroups(predicate: (group: ChatClueGroup) => boolean, limit: number) {
  return dossier.groups
    .filter(predicate)
    .sort((a, b) => b.score - a.score || b.snippetCount - a.snippetCount)
    .slice(0, limit)
}

function section(id: string, title: string, intent: string, groups: ChatClueGroup[]): ChatSynthesisSection {
  return {
    id,
    title,
    intent,
    items: groups.map((group) => itemFor(group, id)),
  }
}

const technicalGroups = selectGroups((group) => technicalPattern.test(textOf(group)), 24)
const academicGroups = selectGroups((group) => academicPattern.test(textOf(group)), 18)
const philosophyGroups = selectGroups((group) => group.sourceType === '聊天导出' && philosophyPattern.test(group.excerpts.join('\n')), 18)
const confirmedGroups = selectGroups((group) => group.sourceType === '聊天导出', 24)
const boundaryGroups = selectGroups((group) => group.sourceType !== '聊天导出' && platformPattern.test(textOf(group)), 18)
const highValueGroups = selectGroups((group) => group.value === 'high', 24)

const sections = [
  section(
    'confirmed-conversations',
    '人物/群组正文整理',
    confirmedGroups.length
      ? '这里放已导入聊天导出的真实人物/群组正文，可继续做主题、人物、资料、待办提炼。'
      : '当前尚未发现可稳定解析的官方/手动聊天导出；本区保留为真实人物/群组正文的入口，避免把缓存片段误判为完整聊天。',
    confirmedGroups,
  ),
  section('technical-value', '技术与 AI 价值线索', '聚合技术、AI、接口、配置、模型、代码相关内容，适合继续复核为知识卡或项目资料。', technicalGroups),
  section('academic-material', '学业与资料线索', '聚合学习、课程、实验、资料和下学期可用内容。', academicGroups),
  section('philosophy-method', '哲理与方法线索', '聚合方法论、复盘、长期目标和判断原则；当前若为空，说明现有可读片段尚未稳定抽到这类内容。', philosophyGroups),
  section('source-boundaries', '来源边界与不可冒充正文', '列出最容易被误认为聊天正文的平台日志、数据库和缓存线索，用来保护整理结论的可信度。', boundaryGroups),
  section('high-value-review', '高价值复核队列', '按分数挑出最值得继续打开源文件核对的线索组。', highValueGroups),
]

const synthesis: ChatSynthesis = {
  generatedAt: new Date().toISOString(),
  totals: {
    groups: dossier.totals.groups,
    snippets: dossier.totals.snippets,
    highValueGroups: dossier.totals.highValueGroups,
    confirmedConversations: confirmedGroups.length,
    sourceOnlyGroups: dossier.groups.filter((group) => group.sourceType !== '聊天导出').length,
    technicalGroups: technicalGroups.length,
    academicGroups: academicGroups.length,
    philosophyGroups: philosophyGroups.length,
  },
  sections,
}

writeJson(path.join(dataDir, 'chat-synthesis.json'), synthesis)

const report = `# 聊天记录整理与价值总结

生成时间：${synthesis.generatedAt}

## 总量

- 线索组：${synthesis.totals.groups}
- 摘录：${synthesis.totals.snippets}
- 高价值组：${synthesis.totals.highValueGroups}
- 已确认聊天导出：${synthesis.totals.confirmedConversations}
- 仅源文件/日志/缓存线索：${synthesis.totals.sourceOnlyGroups}
- 技术与 AI 线索：${synthesis.totals.technicalGroups}
- 学业资料线索：${synthesis.totals.academicGroups}
- 哲理方法线索：${synthesis.totals.philosophyGroups}

${synthesis.sections
  .map(
    (item) => `## ${item.title}

${item.intent}

${item.items.length ? item.items.map((entry, index) => `${index + 1}. ${entry.title}（${entry.scope}，${entry.value}）\n   - ${entry.summary}\n   - 证据：${entry.evidencePath}\n   - 摘录：${entry.excerpts[0] ?? '暂无摘录'}`).join('\n') : '- 暂无可确认条目。'}
`,
  )
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'chat-synthesis.md'), report, 'utf8')
console.log(`Built chat synthesis: ${synthesis.sections.reduce((sum, item) => sum + item.items.length, 0)} items.`)
