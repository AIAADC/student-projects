import { useMemo, useState } from 'react'
import { ExternalLink, Layers3, Search } from 'lucide-react'
import type { SourceFileManifest, ValueCandidateIndex } from '../../types'
import { formatBytes } from '../../utils/format'
import { asSourceFile, type BrowsableFile } from '../../utils/tree'

export function ValueCandidateWorkbench({
  index,
  sourceManifest,
  onOpenFile,
}: {
  index: ValueCandidateIndex
  sourceManifest: SourceFileManifest
  onOpenFile: (file: BrowsableFile) => void
}) {
  const [query, setQuery] = useState('')
  const [bucket, setBucket] = useState('all')
  const [activeId, setActiveId] = useState<string>()
  const buckets = useMemo(() => ['all', ...Object.keys(index.byBucket).sort((a, b) => a.localeCompare(b, 'zh-CN'))], [index.byBucket])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return index.candidates.filter((candidate) => {
      if (bucket !== 'all' && candidate.bucket !== bucket) return false
      if (!q) return true
      return `${candidate.name}\n${candidate.path}\n${candidate.preview}\n${candidate.bucket}\n${candidate.reasons.join(' ')}`.toLowerCase().includes(q)
    })
  }, [bucket, index.candidates, query])
  const current = filtered.find((candidate) => candidate.id === activeId) ?? filtered[0] ?? index.candidates[0]
  const matchedSource = useMemo(() => {
    if (!current) return undefined
    const target = current.path.toLowerCase()
    return sourceManifest.files.find((file) => file.sourcePath.toLowerCase() === target)
  }, [current, sourceManifest.files])

  return (
    <section className="value-workbench">
      <aside className="value-sidebar">
        <div className="clue-totals">
          <div>
            <span>候选</span>
            <strong>{index.totals.candidates.toLocaleString()}</strong>
          </div>
          <div>
            <span>未归档</span>
            <strong>{index.totals.unarchivedFiles.toLocaleString()}</strong>
          </div>
          <div>
            <span>已覆盖变体</span>
            <strong>{index.totals.representedByArchive.toLocaleString()}</strong>
          </div>
          <div>
            <span>候选去重</span>
            <strong>{index.totals.duplicateCandidatesSkipped.toLocaleString()}</strong>
          </div>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索候选名、路径或原因" />
        </div>
        <div className="filter-row wrap" role="group" aria-label="候选分类">
          {buckets.map((item) => (
            <button key={item} className={bucket === item ? 'active' : ''} onClick={() => setBucket(item)} type="button">
              {item === 'all' ? '全部' : item}
            </button>
          ))}
        </div>
        <div className="value-list">
          {filtered.map((candidate) => (
            <button
              key={candidate.id}
              className={candidate.id === current?.id ? 'active' : ''}
              onClick={() => setActiveId(candidate.id)}
              type="button"
              title={candidate.path}
            >
              <span>{candidate.bucket} / {candidate.preview} / {candidate.score}</span>
              <strong>{candidate.name}</strong>
              <em>{candidate.sourceApp} · {formatBytes(candidate.size)} · {new Date(candidate.modified).toLocaleDateString()}</em>
            </button>
          ))}
        </div>
      </aside>
      <article className="value-detail">
        {current ? (
          <>
            <header>
              <div>
                <p className="eyebrow">未归档候选 / {current.action === 'archive_candidate' ? '建议复核归档' : '建议先复核'}</p>
                <h2>{current.name}</h2>
                <span>{current.sourceApp} · {current.bucket} · {current.preview} · {formatBytes(current.size)}</span>
              </div>
              {matchedSource && (
                <button className="open-source-button" onClick={() => onOpenFile(asSourceFile(matchedSource))} type="button">
                  <ExternalLink size={16} />
                  在文件树打开
                </button>
              )}
            </header>
            <div className="database-path">{current.path}</div>
            <section className="value-score-grid">
              <div>
                <span>分数</span>
                <strong>{current.score}</strong>
              </div>
              <div>
                <span>层级</span>
                <strong>{current.level}</strong>
              </div>
              <div>
                <span>分类</span>
                <strong>{current.bucket}</strong>
              </div>
              <div>
                <span>动作</span>
                <strong>{current.action === 'archive_candidate' ? '复核归档' : '先查看'}</strong>
              </div>
            </section>
            <section className="value-reasons">
              <h3>入选原因</h3>
              <div>
                {current.reasons.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </div>
              <p>这些文件尚未复制到 archive，且未被同名媒体变体代表。这里先只读复核，确认有价值后再扩展归档规则，避免把缓存、表情资源或程序组件误当成资料。</p>
            </section>
          </>
        ) : (
          <div className="empty-state">
            <Layers3 size={42} />
            <p>暂无未归档候选。</p>
          </div>
        )}
      </article>
    </section>
  )
}
