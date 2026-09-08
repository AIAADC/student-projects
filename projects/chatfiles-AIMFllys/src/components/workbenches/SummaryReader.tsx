import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { ChatSummary } from '../../types'

export function SummaryReader({ summary }: { summary: ChatSummary }) {
  const [active, setActive] = useState(summary.boards[0]?.id)
  const current = summary.boards.find((board) => board.id === active) ?? summary.boards[0]
  const coverage = [
    ['归档', summary.coverage.archivedFiles.toLocaleString()],
    ['目录', summary.coverage.directoryCount.toLocaleString()],
    ['数据库', summary.coverage.databaseCandidates.toLocaleString()],
    ['表结构', (summary.coverage.databaseTables ?? 0).toLocaleString()],
    ['疑似消息表', (summary.coverage.suspectedMessageTables ?? 0).toLocaleString()],
    ['明文片段', (summary.coverage.binaryTextSnippets ?? 0).toLocaleString()],
    ['导出来源', (summary.coverage.chatExportSources ?? 0).toLocaleString()],
    ['导出消息', (summary.coverage.chatExportMessages ?? 0).toLocaleString()],
    ['导出人物', (summary.coverage.chatExportParticipants ?? 0).toLocaleString()],
    ['源文本', (summary.coverage.sourceTextFiles ?? 0).toLocaleString()],
    ['源摘录', (summary.coverage.sourceTextExtracts ?? 0).toLocaleString()],
    ['文本线索', (summary.coverage.sourceTextChatLike ?? 0).toLocaleString()],
    ['日志文件', (summary.coverage.logTextFiles ?? 0).toLocaleString()],
    ['日志片段', (summary.coverage.logTextSnippets ?? 0).toLocaleString()],
    ['正文片段', (summary.coverage.logTextHighConfidence ?? 0).toLocaleString()],
    ['线索组', (summary.coverage.chatClueGroups ?? 0).toLocaleString()],
    ['高价值线索', (summary.coverage.chatClueHighValue ?? 0).toLocaleString()],
    ['已证明', (summary.coverage.auditProved ?? 0).toLocaleString()],
    ['部分项', (summary.coverage.auditPartial ?? 0).toLocaleString()],
    ['待输入', (summary.coverage.auditNeedsInput ?? 0).toLocaleString()],
    ['可读文本', summary.coverage.textExtracts.toLocaleString()],
  ]

  return (
    <section className="summary-layout">
      <aside className="summary-index">
        <div className="summary-score">
          {coverage.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        {summary.boards.map((board) => (
          <button
            key={board.id}
            className={board.id === current?.id ? `active ${board.priority}` : board.priority}
            onClick={() => setActive(board.id)}
            type="button"
          >
            <span>{board.scope}</span>
            {board.title}
          </button>
        ))}
      </aside>
      <article className="reader summary-reader markdown-body">
        {current ? (
          <>
            <p className="eyebrow">{current.tags.join(' / ')}</p>
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {current.content}
            </ReactMarkdown>
            <section className="evidence-box">
              <h3>证据来源</h3>
              {current.evidence.length ? (
                <ul>
                  {current.evidence.slice(0, 12).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p>暂无可列证据。</p>
              )}
            </section>
          </>
        ) : (
          <p>暂无总结。</p>
        )}
      </article>
      <aside className="extract-panel">
        <h2>可读文本</h2>
        {summary.textExtracts.length ? (
          summary.textExtracts.map((item) => (
            <section key={item.id}>
              <strong>{item.title}</strong>
              <span>{item.signals.join(' / ')}</span>
              <p>{item.excerpt}</p>
            </section>
          ))
        ) : (
          <p>当前没有可直接读取的聊天文本导出。</p>
        )}
      </aside>
    </section>
  )
}
