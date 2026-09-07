import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import type { CourseItem } from '../shared/contracts/index.js'
import { dataDir, ensureDir, writeJson } from './shared.js'

// Course site + owner identity are injected locally (gitignored .env.local) — see
// .env.example. Without COURSE_URL there is nothing school-specific to fetch.
const url = (process.env.COURSE_URL || '').trim()
const OWNER_IDENTITY = (process.env.OWNER_IDENTITY || '').trim()
const idPrefix = OWNER_IDENTITY ? `${OWNER_IDENTITY} ` : ''

type SiteState = {
  archive?: CourseItem[]
  forecast?: CourseItem[]
}

ensureDir(dataDir)

if (!url) {
  console.log('COURSE_URL 未设置，跳过课程站点抓取（在 .env.local 里填 COURSE_URL 即可启用）。')
  process.exit(0)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ locale: 'zh-CN' })
await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 })
await page.waitForTimeout(1500)

const bodyText = await page.locator('body').innerText()
const storage = await page.evaluate(() => ({ ...localStorage }))
await browser.close()

const rawState = storage['new-gpa-state-v1']
let state: SiteState = {}
if (rawState) state = JSON.parse(rawState) as SiteState

const coursePlan = [...(state.archive ?? []), ...(state.forecast ?? [])]
writeJson(path.join(dataDir, 'course-plan.json'), {
  generatedAt: new Date().toISOString(),
  source: url,
  coursePlan,
})

const lines = [
  `# ${idPrefix}学业资料索引`,
  '',
  `来源：${url}`,
  `抓取时间：${new Date().toISOString()}`,
  '',
  '## 下学期预测课程',
  '',
  ...(state.forecast ?? []).map((course) => {
    const parts = [
      `### ${course.name}`,
      '',
      `- 学分：${course.credits}`,
      course.examDate ? `- 考试时间：${course.examDate}` : undefined,
      course.usualWeight != null ? `- 平时占比：${Math.round(course.usualWeight * 100)}%` : undefined,
      course.examWeight != null ? `- 期末占比：${Math.round(course.examWeight * 100)}%` : undefined,
      course.notes ? `- 备注：${course.notes}` : undefined,
      '',
    ].filter(Boolean)
    return parts.join('\n')
  }),
  '',
  '## 页面文本快照',
  '',
  '```text',
  bodyText.slice(0, 12000),
  '```',
]

fs.writeFileSync(path.join(dataDir, 'course-plan.md'), `${lines.join('\n')}\n`, 'utf8')
console.log(`Fetched ${coursePlan.length} courses from ${url}`)
