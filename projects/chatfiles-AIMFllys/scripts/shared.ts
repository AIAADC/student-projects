import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import mime from 'mime'
import type { Category, LibraryFile } from '../shared/contracts/index.js'
import { loadLocalEnv } from './localEnv.js'

export const root = path.resolve(process.cwd())
loadLocalEnv({ filePath: path.join(root, '.env.local') })
export const dataDir = path.join(root, 'data')
export const archiveDir = path.join(root, 'archive')
export const home = process.env.USERPROFILE ?? ''

export const candidateRoots = [
  path.join(home, 'Documents', 'Tencent Files', (process.env.QQ_NUMBER || ''), 'nt_qq', 'nt_data'),
  path.join(home, 'Documents', 'WeChat Files'),
  path.join(home, 'AppData', 'Local', 'Temp', 'WeChat Files'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'net', 'cdncomm', 'cdn', 'download'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'net_1', 'cdncomm', 'cdn', 'download'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'ilink', 'netbridge', 'cdn', 'cdn', 'download'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat', 'radium', 'users'),
  path.join(home, 'AppData', 'Roaming', 'Tencent', 'WXWork'),
].filter((item, index, arr) => item && arr.indexOf(item) === index)

export const explorationRoots = [
  path.join(home, 'Documents', 'Tencent Files'),
  path.join(home, 'Documents', 'WeChat Files'),
  path.join(home, 'AppData', 'Roaming', 'QQ'),
  path.join(home, 'AppData', 'Roaming', 'Tencent'),
  path.join(home, 'AppData', 'Local', 'Tencent'),
  path.join(home, 'AppData', 'Local', 'Temp', 'WeChat Files'),
].filter((item, index, arr) => item && arr.indexOf(item) === index)

const allowedAttachment = /\.(pdf|docx?|pptx?|xlsx?|csv|txt|md|zip|rar|7z|py|ipynb|cpp|c|h|java|js|ts|tsx|html|css|png|jpe?g|gif|webp|bmp|mp4|mov|mkv|webm|mp3|wav|ogg|silk|amr)$/i
const deniedAttachmentPath =
  /\\(log-cache|avatar|Emoji|OnlineStatus|xplugin|XPlugin|upgrade|crash|cache|CacheStorage|Service Worker|Local Storage|Session Storage|xworker|publicLib|codecache|shared\\ad|logs?|temp_log|tbs|DynamicResource|DynamicResourcePackage)\\/i
const deniedAttachmentFile = /\.(log|xlog|dat|db|db-shm|db-wal|ldb|sst|tmp|bak|ini|json|map)$/i

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

export function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function sha256File(filePath: string, options: { highWaterMark?: number } = {}) {
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath, { highWaterMark: options.highWaterMark })
  for await (const chunk of stream) hash.update(chunk)
  return hash.digest('hex')
}

export function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    if (entry.isFile()) out.push(full)
  }
  return out
}

export function isEligibleAttachment(filePath: string) {
  if (/\\xwechat\\radium\\users\\/i.test(filePath) && !/\\applet\\local\\[^\\]+\\temp\\/i.test(filePath)) return false
  if (/\\xwechat\\radium\\users\\/i.test(filePath) && /\.(png|jpe?g|gif|webp|bmp)$/i.test(filePath)) {
    const name = path.basename(filePath)
    const size = fs.statSync(filePath).size
    if (/@[23]x|_[23]x|-1\.png$|-150\.png$|100\.png$/i.test(name)) return false
    if (!/^[a-f0-9]/i.test(name) && size < 128 * 1024) return false
  }
  return allowedAttachment.test(filePath) && !deniedAttachmentPath.test(filePath) && !deniedAttachmentFile.test(filePath)
}

export function sourceApp(filePath: string): LibraryFile['sourceApp'] {
  if (/WXWork/i.test(filePath)) return '企业微信'
  if (/Tencent Files|\\AppData\\Roaming\\QQ(?:\\|$)|\\Tencent\\QQ(?:\\|$)/i.test(filePath)) return 'QQ'
  if (/WeChat|xwechat|微信/i.test(filePath)) return '微信'
  return '未知'
}

const categoryKeywords: Array<[Category, RegExp]> = [
  ['AI', /(^|[^a-z])ai([^a-z]|$)|人工智能|机器学习|深度学习|llm|prompt|gpt|openai|claude|deepseek|大模型|神经网络|agent|多模态|stable\s?diffusion|comfyui/i],
  ['比赛', /比赛|竞赛|挑战杯|互联网\+|大创|数学建模|建模|赛道|路演|答辩|赛|锦兰杯|创新创业大赛/i],
  ['创业', /创业|商业计划|bp|融资|商业|公司|产品|市场|运营|增长|获客|简历|resume|offer|求职|校招|实习|内推|生涯|职业规划|教培|项目计划/i],
  ['树林', /树林|forest|tree|植物|生态|自然|森林/i],
  ['专业', /解剖|生理|生化|组胚|病理|药理|临床|基础医学|医学|科研|论文|课题|实验报告|细胞|免疫|分子|病例/i],
  ['学业', /学业|课程|作业|考试|期末|期中|复习|资料|讲义|笔记|真题|基医|强基|hust|华科|高数|微积分|线代|英语|四六级|思政|概率|物理|化学|导论|体育|讲座/i],
  ['项目', /roadmap|需求|prd|迭代|架构|方案|里程碑|开发文档|接口文档/i],
  ['健康', /体检|病历|睡眠|健身|运动计划|饮食|心理|健康/i],
  ['财务', /账单|发票|报销|预算|收入|支出|合同|银行|付款|收款|财务/i],
  ['旅行', /旅行|旅游|机票|酒店|行程|车票|攻略/i],
  ['阅读', /读书|摘录|读后感|article|paper|book|epub|电子书/i],
  ['工具', /脚本|配置|安装|插件|workflow|自动化|教程|指南|手册|cheatsheet/i],
  ['人物', /名片|通讯录|联系人|导师|老师同学/i],
  ['生活', /照片|日常|家庭|聚会|回忆|生活/i],
]

export function classify(filePath: string): { category: Category; subcategory: string[] } {
  const text = filePath.replace(/\\/g, '/')
  const ext = path.extname(filePath).toLowerCase()
  const matched = categoryKeywords.find(([, pattern]) => pattern.test(text))
  if (matched) return { category: matched[0], subcategory: subcategoryFor(ext, text) }
  if (/\.(pdf|docx?|pptx?|xlsx?|csv|txt|md)$/i.test(ext)) {
    return { category: '学业', subcategory: subcategoryFor(ext, text) }
  }
  if (/\.(png|jpe?g|gif|webp|bmp|mp4|mov|mkv|webm|mp3|wav|ogg|silk|amr)$/i.test(ext)) {
    return { category: '过去', subcategory: subcategoryFor(ext, text) }
  }
  if (/\.(zip|rar|7z)$/i.test(ext)) return { category: '素材', subcategory: ['压缩包'] }
  return { category: '未归类', subcategory: subcategoryFor(ext, text) }
}

function subcategoryFor(ext: string, text: string) {
  if (/Pic|Image|Thumb|Ori/i.test(text) || /\.(png|jpe?g|gif|webp)$/i.test(ext)) return ['聊天影像']
  if (/Video/i.test(text) || /\.(mp4|mov|mkv|webm)$/i.test(ext)) return ['视频']
  if (/Ptt|Audio|Voice/i.test(text) || /\.(mp3|wav|ogg|silk|amr)$/i.test(ext)) return ['语音']
  if (/\.(pdf)$/i.test(ext)) return ['文档', 'PDF']
  if (/\.(html?)$/i.test(ext)) return ['文档', '网页']
  if (/\.(json)$/i.test(ext)) return ['文档', '结构化数据']
  if (/\.(docx?|md|txt)$/i.test(ext)) return ['文档', '文本']
  if (/\.(pptx?)$/i.test(ext)) return ['文档', '演示']
  if (/\.(xlsx?|csv)$/i.test(ext)) return ['文档', '表格']
  if (/\.(py|ipynb|js|ts|tsx|cpp|c|h|java|html|css)$/i.test(ext)) return ['代码']
  return ['其他']
}

export function previewFor(filePath: string): LibraryFile['preview'] {
  const ext = path.extname(filePath).toLowerCase()
  const base = path.basename(filePath).toLowerCase()
  if (/\.(db|sqlite|sqlite3|db-wal|db-shm)$/i.test(ext) || /\\nt_db\\/i.test(filePath)) return 'database'
  if (/\.(png|jpe?g|gif|webp|bmp|svg|ico|apng|avif)$/i.test(ext)) return 'image'
  if (/\.(mp4|webm|mov|mkv)$/i.test(ext)) return 'video'
  if (/\.(amr|silk)$/i.test(ext)) return 'voice'
  if (/\.(mp3|wav|ogg)$/i.test(ext)) return 'audio'
  if (/\.(ttf|otf|woff2?)$/i.test(ext)) return 'font'
  if (ext === '.pdf') return 'pdf'
  if (/\.(docx)$/i.test(ext)) return 'docx'
  if (/\.(xlsx?|csv)$/i.test(ext)) return 'sheet'
  if (/\.(html?)$/i.test(ext)) return 'html'
  if (/\.(json)$/i.test(ext)) return 'json'
  if (/\.(md|markdown)$/i.test(ext)) return 'markdown'
  if (/^(log|log\.old|current|manifest-\d+)$/i.test(base)) return 'text'
  if (/\.(txt|json|log|xml|yml|yaml|toml|ini|cfg|conf|config|plist|pem|key|crt|cer|lic|manifest)$/i.test(ext)) return 'text'
  if (/\.(pptx?|ppsx)$/i.test(ext)) return 'presentation'
  if (/\.(zip|rar|7z)$/i.test(ext)) return 'archive'
  if (/\.(effect)$/i.test(ext)) return 'code'
  if (/\.(py|ipynb|js|ts|tsx|cpp|c|h|java|html|css|lua)$/i.test(ext)) return 'code'
  return 'download'
}

export function mimeFor(filePath: string) {
  return mime.getType(filePath) ?? 'application/octet-stream'
}

export function safeName(name: string) {
  const illegalChars = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
  const safe = [...name].map((char) => (illegalChars.has(char) || char.charCodeAt(0) < 32 ? '_' : char)).join('')
  return safe.trim() || 'unnamed'
}

export function duplicateStem(name: string) {
  const ext = path.extname(name)
  const stem = path.basename(name, ext)
  const match = stem.match(/^(.*?)(?:\((\d+)\))?$/)
  return {
    key: `${(match?.[1] ?? stem).trim().toLowerCase()}${ext.toLowerCase()}`,
    serial: Number(match?.[2] ?? 0),
  }
}
