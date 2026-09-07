import { useMemo, useState } from 'react'
import { ExternalLink, MessageSquareText, Search } from 'lucide-react'
import type { ChatClueDossier, ChatClueGroup, LibraryManifest, SourceFileManifest } from '../../types'
import { asArchiveFile, asSourceFile, type BrowsableFile } from '../../utils/tree'

function clueValueLabel(value: ChatClueGroup['value']) {
  if (value === 'high') return '高价值'
  if (value === 'medium') return '中价值'
  return '低价值'
}

function findSourceMatch(group: ChatClueGroup, sourceManifest: SourceFileManifest, manifest: LibraryManifest) {
  const target = group.path.toLowerCase()
  const source = sourceManifest.files.find((file) => file.sourcePath.toLowerCase() === target)
  if (source) return asSourceFile(source)
  const archived = manifest.files.find((file) => file.sourcePath.toLowerCase() === target || file.archivePath.toLowerCase() === target)
  return archived ? asArchiveFile(archived) : undefined
}

export function ChatClueReader({
  dossier,
  sourceManifest,
  manifest,
  onOpenFile,
}: {
  dossier: ChatClueDossier
  sourceManifest: SourceFileManifest
  manifest: LibraryManifest
  onOpenFile: (file: BrowsableFile) => void
}) {
  const [query, setQuery] = useState('')
  const [valueFilter, setValueFilter] = useState<'all' | ChatClueGroup['value']>('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [activeId, setActiveId] = useState(dossier.groups[0]?.id)
  const sourceTypes = useMemo(() => Object.keys(dossier.totals.bySourceType).sort((a, b) => a.localeCompare(b, 'zh-CN')), [dossier.totals.bySourceType])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return dossier.groups.filter((group) => {
      if (valueFilter !== 'all' && group.value !== valueFilter) return false
      if (typeFilter !== 'all' && group.sourceType !== typeFilter) return false
      if (!q) return true
      return `${group.path}\n${group.sourceType}\n${group.sourceApp}\n${group.signals.join(' ')}\n${group.verdict}\n${group.excerpts.join('\n')}`.toLowerCase().includes(q)
    })
  }, [dossier.groups, query, typeFilter, valueFilter])
  const active = filtered.find((group) => group.id === activeId) ?? filtered[0]
  const match = active ? findSourceMatch(active, sourceManifest, manifest) : undefined

  return (
    <section className="clue-workbench">
      <aside className="clue-sidebar">
        <div className="clue-totals">
          <div>
            <span>线索组</span>
            <strong>{dossier.totals.groups.toLocaleString()}</strong>
          </div>
          <div>
            <span>片段</span>
            <strong>{dossier.totals.snippets.toLocaleString()}</strong>
          </div>
          <div>
            <span>高价值</span>
            <strong>{dossier.totals.highValueGroups.toLocaleString()}</strong>
          </div>
          <div>
            <span>导出消息</span>
            <strong>{dossier.totals.chatExportMessages.toLocaleString()}</strong>
          </div>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索路径、信号或摘录" />
        </div>
        <div className="filter-row" role="group" aria-label="线索价值">
          {(['all', 'high', 'medium', 'low'] as const).map((value) => (
            <button key={value} className={valueFilter === value ? 'active' : ''} onClick={() => setValueFilter(value)} type="button">
              {value === 'all' ? '全部' : clueValueLabel(value)}
            </button>
          ))}
        </div>
        <div className="filter-row source-types" role="group" aria-label="线索来源">
          <button className={typeFilter === 'all' ? 'active' : ''} onClick={() => setTypeFilter('all')} type="button">
            全部来源
          </button>
          {sourceTypes.map((type) => (
            <button key={type} className={typeFilter === type ? 'active' : ''} onClick={() => setTypeFilter(type)} type="button">
              {type}
            </button>
          ))}
        </div>
        <div className="clue-list">
          {filtered.map((group) => (
            <button key={group.id} className={group.id === active?.id ? `active ${group.value}` : group.value} onClick={() => setActiveId(group.id)} type="button">
              <span>{group.sourceType} / {group.sourceApp}</span>
              <strong>{clueValueLabel(group.value)} · {group.score}</strong>
              <em>{group.signals.join('、') || '待复核'}</em>
              <small>{group.path}</small>
            </button>
          ))}
        </div>
      </aside>
      <article className="clue-detail">
        {active ? (
          <>
            <header>
              <p className="eyebrow">{active.sourceType} / {active.sourceApp} / {clueValueLabel(active.value)}</p>
              <h2>{active.signals.join('、') || '待人工复核'}</h2>
              <span>{active.score} 分 · {active.snippetCount} 段摘录</span>
            </header>
            <section className="clue-path">
              <strong>源路径</strong>
              <code>{active.path}</code>
              {match ? (
                <button onClick={() => onOpenFile(match)} type="button">
                  <ExternalLink size={16} />
                  打开右侧源文件
                </button>
              ) : (
                <p>当前线索来自聚合证据，未能直接匹配到文件树条目。</p>
              )}
            </section>
            <section className="clue-judgement">
              <div>
                <span>判读</span>
                <p>{active.verdict}</p>
              </div>
              <div>
                <span>下一步</span>
                <p>{active.next}</p>
              </div>
            </section>
            <section className="clue-excerpts">
              <h3>摘录证据</h3>
              {active.excerpts.map((excerpt) => (
                <blockquote key={excerpt}>{excerpt}</blockquote>
              ))}
            </section>
          </>
        ) : (
          <div className="empty-preview">
            <MessageSquareText size={42} />
            <h2>没有匹配线索</h2>
            <p>换一个搜索词或筛选条件。</p>
          </div>
        )}
      </article>
    </section>
  )
}
