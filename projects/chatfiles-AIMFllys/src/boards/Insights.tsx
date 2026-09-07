import { useMemo, useState } from 'react'
import { Lightbulb } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { InsightNugget, InsightsResponse } from '../types'
import { useVisibleCount } from '../hooks/useVisibleCount'

// preferred category order; anything else appended after
const ORDER = ['技术', '哲理', '学业', '创业', '比赛', 'AI', '人物', '资源工具', '生活', '健康', '财务', '专业', '其他']

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

function NuggetCard({ n }: { n: InsightNugget }) {
  return (
    <article className="nugget">
      <h3>{n.title}</h3>
      <p className="nugget-body">{n.content}</p>
      <footer className="nugget-foot">
        <span className="nugget-conv">
          {n.isGroup ? '群 · ' : ''}
          {n.conv ?? '未知会话'}
        </span>
        {n.people && n.people.length > 0 && <span className="nugget-people">{n.people.join('、')}</span>}
        {n.date && <span className="nugget-date">{n.date}</span>}
        {importanceDots(n.importance)}
      </footer>
    </article>
  )
}

export default function InsightsBoard({ insights }: { insights: InsightsResponse }) {
  const categories = useMemo(() => {
    const keys = Object.keys(insights.byCategory)
    return keys.sort((a, b) => {
      const ia = ORDER.indexOf(a)
      const ib = ORDER.indexOf(b)
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'zh-CN')
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  }, [insights.byCategory])

  const [active, setActive] = useState<string>(categories[0] ?? '')
  const current = categories.includes(active) ? active : categories[0] ?? ''
  const nuggets = current ? insights.byCategory[current] ?? [] : []
  const board = current ? insights.boards[current] : undefined
  const { count, sentinelRef, done } = useVisibleCount(nuggets.length, 36, current)
  const shownNuggets = nuggets.slice(0, count)

  const empty = !categories.length

  return (
    <section className="ins">
      <aside className="ins-rail">
        <p className="eyebrow">COMMONPLACE · 札记分类</p>
        <div className="ins-totals">
          <div>
            <span>会话</span>
            <strong>{insights.convCount.toLocaleString()}</strong>
          </div>
          <div>
            <span>碎金</span>
            <strong>{insights.nuggetCount.toLocaleString()}</strong>
          </div>
        </div>
        <div className="ins-cats">
          {categories.map((c) => (
            <button key={c} type="button" className={c === current ? 'on' : ''} onClick={() => setActive(c)}>
              <span>{c}</span>
              <em>{insights.byCategory[c].length}</em>
            </button>
          ))}
        </div>
      </aside>

      <article className="ins-main">
        {empty ? (
          <div className="ins-empty">
            <Lightbulb size={40} />
            <h2>洞察生成中…</h2>
            <p>AI 正在逐会话淘洗碎金。完成后，这里会按技术、哲理、学业、人物等分门别类地呈现。</p>
          </div>
        ) : (
          <>
            <header className="ins-head">
              <p className="eyebrow">{current}</p>
              <h2>{current} · {nuggets.length} 则</h2>
            </header>
            {board && (
              <section className="ins-board markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                  {board}
                </ReactMarkdown>
              </section>
            )}
            {nuggets.length ? (
              <>
                <div className="nugget-grid">
                  {shownNuggets.map((n, i) => (
                    <NuggetCard key={`${n.title}-${i}`} n={n} />
                  ))}
                </div>
                {!done && (
                  <div ref={sentinelRef} className="lazy-sentinel">
                    正在载入更多碎金… {count} / {nuggets.length}
                  </div>
                )}
              </>
            ) : (
              <div className="ins-empty small">
                <p>这个分类暂时还没有碎金。</p>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  )
}
