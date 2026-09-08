import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { KnowledgeSection } from '../../types'

export function KnowledgeReader({ sections }: { sections: KnowledgeSection[] }) {
  const [active, setActive] = useState(sections[0]?.id)
  const current = sections.find((section) => section.id === active) ?? sections[0]
  return (
    <section className="knowledge-grid">
      <aside className="knowledge-list">
        {sections.map((section) => (
          <button
            key={section.id}
            className={section.id === current?.id ? 'active' : ''}
            onClick={() => setActive(section.id)}
            type="button"
          >
            <span>{section.scope}</span>
            {section.title}
          </button>
        ))}
      </aside>
      <article className="reader markdown-body">
        {current ? (
          <>
            <p className="eyebrow">{current.tags.join(' / ')}</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {current.content}
            </ReactMarkdown>
          </>
        ) : (
          <p>暂无整理内容。</p>
        )}
      </article>
    </section>
  )
}
