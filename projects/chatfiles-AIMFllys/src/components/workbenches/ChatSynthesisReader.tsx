import { useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import type { ChatSynthesis } from '../../types'

export function ChatSynthesisReader({ synthesis }: { synthesis: ChatSynthesis }) {
  const [active, setActive] = useState(synthesis.sections[0]?.id)
  const current = synthesis.sections.find((section) => section.id === active) ?? synthesis.sections[0]

  return (
    <section className="chat-synthesis">
      <aside className="synthesis-sidebar">
        <div className="clue-totals">
          <div>
            <span>线索组</span>
            <strong>{synthesis.totals.groups.toLocaleString()}</strong>
          </div>
          <div>
            <span>摘录</span>
            <strong>{synthesis.totals.snippets.toLocaleString()}</strong>
          </div>
          <div>
            <span>真实导出</span>
            <strong>{synthesis.totals.confirmedConversations.toLocaleString()}</strong>
          </div>
          <div>
            <span>源线索</span>
            <strong>{synthesis.totals.sourceOnlyGroups.toLocaleString()}</strong>
          </div>
        </div>
        <div className="synthesis-section-list">
          {synthesis.sections.map((section) => (
            <button key={section.id} className={section.id === current?.id ? 'active' : ''} onClick={() => setActive(section.id)} type="button">
              <span>{section.items.length.toLocaleString()} 条</span>
              {section.title}
            </button>
          ))}
        </div>
      </aside>
      <article className="synthesis-reader">
        {current ? (
          <>
            <header>
              <p className="eyebrow">聊天整理 / 证据分层</p>
              <h2>{current.title}</h2>
              <p>{current.intent}</p>
            </header>
            <div className="synthesis-items">
              {current.items.length ? (
                current.items.map((item) => (
                  <section className={`synthesis-card ${item.value}`} key={item.id}>
                    <div>
                      <p className="eyebrow">{item.scope}</p>
                      <h3>{item.title}</h3>
                      <span>{item.signals.join(' / ') || item.sourceType}</span>
                    </div>
                    <p>{item.summary}</p>
                    <p className="synthesis-next">{item.next}</p>
                    <code>{item.evidencePath}</code>
                    {item.excerpts.length > 0 && (
                      <div className="synthesis-excerpts">
                        {item.excerpts.map((excerpt) => (
                          <blockquote key={excerpt}>{excerpt}</blockquote>
                        ))}
                      </div>
                    )}
                  </section>
                ))
              ) : (
                <div className="empty-state">
                  <MessageSquareText size={42} />
                  <p>这个分区暂无可确认条目。</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <MessageSquareText size={42} />
            <p>暂无聊天整理数据。</p>
          </div>
        )}
      </article>
    </section>
  )
}
