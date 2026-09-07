import { useMemo } from 'react'
import { ExternalLink, GraduationCap } from 'lucide-react'
import type { InsightNugget, InsightsResponse, KnowledgeBase } from '../types'

// Owner identity + course site come from the local (gitignored) .env.local — nothing
// personal is hard-coded in the open-source shell. See .env.example.
const OWNER_IDENTITY = (import.meta.env.VITE_OWNER_IDENTITY ?? '').trim()
const COURSE_URL = (import.meta.env.VITE_COURSE_URL ?? '').trim()

function importanceDots(n?: number) {
  const v = Math.max(0, Math.min(5, Math.round(n ?? 0)))
  return (
    <span className="imp-dots" aria-label={`重要度 ${v}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= v ? 'on' : ''} />
      ))}
    </span>
  )
}

export default function AcademicsBoard({
  insights,
  knowledge,
}: {
  insights: InsightsResponse
  knowledge: KnowledgeBase
}) {
  const nuggets = useMemo<InsightNugget[]>(() => {
    const acc: InsightNugget[] = []
    for (const cat of ['学业', '专业']) {
      for (const n of insights.byCategory[cat] ?? []) acc.push(n)
    }
    return acc.sort((a, b) => Number(b.importance ?? 0) - Number(a.importance ?? 0))
  }, [insights.byCategory])

  return (
    <section className="aca">
      <header className="aca-hero rise">
        <p className="eyebrow">{OWNER_IDENTITY ? `ACADEMICS · ${OWNER_IDENTITY}` : 'ACADEMICS'}</p>
        <h1 className="aca-title">学业</h1>
        <p className="aca-sub">把散落在聊天与文件里的学业线索收拢成一处——课程、成绩、专业笔记，以及下学期的去向。</p>
      </header>

      <div className="aca-grid">
        {COURSE_URL && (
          <a className="aca-course rise" href={COURSE_URL} target="_blank" rel="noreferrer">
            <span className="aca-course-icon">
              <GraduationCap size={22} />
            </span>
            <p className="eyebrow">下学期课程</p>
            <h3>课程站点 · 选课与成绩</h3>
            <p className="aca-course-body">前往你的课程站点查阅下学期课程安排、学分与 GPA 测算。</p>
            <span className="aca-course-go">
              打开 <ExternalLink size={15} />
            </span>
          </a>
        )}

        {knowledge.sections.slice(0, 5).map((s) => (
          <article className="aca-know rise" key={s.id}>
            <p className="eyebrow">{s.scope || '知识整理'}</p>
            <h3>{s.title}</h3>
            <p className="aca-know-body">{s.content.replace(/[#*`>]/g, '').slice(0, 160).trim()}…</p>
            {s.tags.length > 0 && (
              <div className="aca-tags">
                {s.tags.slice(0, 4).map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      <section className="aca-nuggets">
        <header className="ins-head">
          <p className="eyebrow">学业 / 专业 碎金</p>
          <h2>{nuggets.length} 则学业洞察</h2>
        </header>
        {nuggets.length ? (
          <div className="nugget-grid">
            {nuggets.map((n, i) => (
              <article className="nugget" key={`${n.title}-${i}`}>
                <h3>{n.title}</h3>
                <p className="nugget-body">{n.content}</p>
                <footer className="nugget-foot">
                  <span className="nugget-conv">{n.conv ?? '未知会话'}</span>
                  {n.people && n.people.length > 0 && <span className="nugget-people">{n.people.join('、')}</span>}
                  {n.date && <span className="nugget-date">{n.date}</span>}
                  {importanceDots(n.importance)}
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="ins-empty small">
            <p>学业洞察生成中…完成后这里会汇集课程、考试与专业相关的碎金。</p>
          </div>
        )}
      </section>
    </section>
  )
}
