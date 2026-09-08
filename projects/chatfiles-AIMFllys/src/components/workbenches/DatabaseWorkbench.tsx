import { useMemo, useState } from 'react'
import { DatabaseZap, ExternalLink, Search } from 'lucide-react'
import type { DatabaseAnalysis, SourceFileManifest } from '../../types'
import { fileNameFromPath, formatBytes } from '../../utils/format'
import { asSourceFile, type BrowsableFile } from '../../utils/tree'

export function DatabaseWorkbench({
  analysis,
  sourceManifest,
  onOpenFile,
}: {
  analysis: DatabaseAnalysis
  sourceManifest: SourceFileManifest
  onOpenFile: (file: BrowsableFile) => void
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | 'unreadable' | 'readable' | 'suspected'>('all')
  const [activePath, setActivePath] = useState<string>()
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return analysis.databases.filter((database) => {
      if (status === 'readable' && !database.readable) return false
      if (status === 'unreadable' && database.readable) return false
      if (status === 'suspected' && !database.tables.some((table) => table.suspectedMessage)) return false
      if (!q) return true
      return `${database.path}\n${database.app}\n${database.detail}\n${database.tables.map((table) => `${table.name} ${table.focus}`).join('\n')}`.toLowerCase().includes(q)
    })
  }, [analysis.databases, query, status])
  const current = filtered.find((database) => database.path === activePath) ?? filtered[0] ?? analysis.databases[0]
  const matchedSource = useMemo(() => {
    if (!current) return undefined
    const target = current.path.toLowerCase()
    return sourceManifest.files.find((file) => file.sourcePath.toLowerCase() === target)
  }, [current, sourceManifest.files])
  const samples = useMemo(
    () =>
      current?.tables
        .flatMap((table) => table.textSamples.map((sample) => ({ ...sample, table: sample.table || table.name })))
        .slice(0, 16) ?? [],
    [current],
  )

  return (
    <section className="database-workbench">
      <aside className="database-sidebar">
        <div className="clue-totals">
          <div>
            <span>库候选</span>
            <strong>{analysis.databases.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>可读</span>
            <strong>{analysis.totals.readableDatabases.toLocaleString()}</strong>
          </div>
          <div>
            <span>不可读</span>
            <strong>{analysis.totals.unreadableDatabases.toLocaleString()}</strong>
          </div>
          <div>
            <span>疑似正文表</span>
            <strong>{analysis.totals.suspectedMessageTables.toLocaleString()}</strong>
          </div>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索库名、路径、表或线索" />
        </div>
        <div className="filter-row" role="group" aria-label="数据库状态">
          {([
            ['all', '全部'],
            ['unreadable', '不可读'],
            ['readable', '可读'],
            ['suspected', '疑似正文'],
          ] as const).map(([id, label]) => (
            <button key={id} className={status === id ? 'active' : ''} onClick={() => setStatus(id)} type="button">
              {label}
            </button>
          ))}
        </div>
        <div className="database-list">
          {filtered.map((database) => (
            <button
              key={database.path}
              className={database.path === current?.path ? 'active' : ''}
              onClick={() => setActivePath(database.path)}
              type="button"
              title={database.path}
            >
              <strong>{fileNameFromPath(database.path)}</strong>
              <span>{database.app} / {database.readable ? `${database.tables.length} 张表` : '不可读边界'}</span>
              <em>{formatBytes(database.size)} · {new Date(database.modified).toLocaleDateString()}</em>
            </button>
          ))}
        </div>
      </aside>
      <article className="database-detail">
        {current ? (
          <>
            <header>
              <div>
                <p className="eyebrow">{current.readable ? 'SQLite 可读结构' : '聊天库读取边界'}</p>
                <h2>{fileNameFromPath(current.path)}</h2>
                <span>{current.app} · {formatBytes(current.size)} · {new Date(current.modified).toLocaleString()}</span>
              </div>
              {matchedSource && (
                <button className="open-source-button" onClick={() => onOpenFile(asSourceFile(matchedSource))} type="button">
                  <ExternalLink size={16} />
                  在文件树打开
                </button>
              )}
            </header>
            <div className="database-path">{current.path}</div>
            <section className="database-boundary-grid">
              <div>
                <span>读取状态</span>
                <strong>{current.readable ? '可读' : '不可读'}</strong>
              </div>
              <div>
                <span>表数量</span>
                <strong>{current.tables.length.toLocaleString()}</strong>
              </div>
              <div>
                <span>文本样本</span>
                <strong>{samples.length.toLocaleString()}</strong>
              </div>
              <div>
                <span>判断</span>
                <strong>{current.tables.some((table) => table.suspectedMessage) ? '需复核正文表' : '未见正文表'}</strong>
              </div>
            </section>
            <section className="database-verdict">
              <h3>{current.readable ? '结构结论' : '边界结论'}</h3>
              <p>{current.detail}</p>
              {!current.readable && (
                <p>该项只做只读识别和证据呈现；QQ NT / WeChat 相关私有库不在这里强行写入、修复或解密，避免破坏原始聊天记录。</p>
              )}
            </section>
            {current.tables.length > 0 && (
              <section className="database-tables">
                <h3>表结构与样本</h3>
                {current.tables.map((table) => (
                  <div className="database-table-card" key={table.name}>
                    <div>
                      <strong>{table.name}</strong>
                      <span>{table.focus} · {table.rowCount.toLocaleString()} 行 · {table.columns.length} 列</span>
                    </div>
                    <p>{table.columns.slice(0, 14).map((column) => `${column.name}:${column.type || 'UNKNOWN'}`).join(' / ')}</p>
                    {table.textSamples.slice(0, 3).map((sample) => (
                      <blockquote key={`${table.name}-${sample.column}-${sample.valuePreview}`}>
                        <span>{sample.column} · {sample.signals.join(' / ') || '文本样本'}</span>
                        {sample.valuePreview}
                      </blockquote>
                    ))}
                  </div>
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="empty-state">
            <DatabaseZap size={42} />
            <p>暂无数据库分析结果。</p>
          </div>
        )}
      </article>
    </section>
  )
}
