import { useEffect, useMemo, useRef, useState } from 'react'
import { Film, ImageOff, Mic2, Search } from 'lucide-react'
import type { LibraryFile, LibraryManifest } from '../../types'
import { formatBytes } from '../../utils/format'
import { useGridVirtualizer } from '../../hooks/useGridVirtualizer'
import { asArchiveFile, thumbUrl, type BrowsableFile } from '../../utils/tree'

// keep these in lockstep with workbenches-media.css (.media-card height + .media-grid gap/pad)
const CARD_H = 248
const GAP = 12
const PAD = 14
const MIN_COL = 220
const ROW_H = CARD_H + GAP

function MediaThumb({ file }: { file: BrowsableFile }) {
  const [failed, setFailed] = useState(false)
  if (file.preview === 'audio' || file.preview === 'voice') return <Mic2 size={34} />
  if (failed) return file.preview === 'video' ? <Film size={32} /> : <ImageOff size={28} />
  return (
    <>
      <img
        src={thumbUrl(file, 360)}
        alt={file.name}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        onError={() => setFailed(true)}
      />
      {file.preview === 'video' && (
        <span className="media-play" aria-hidden>
          ▶
        </span>
      )}
    </>
  )
}

export function MediaReview({
  manifest,
  onOpenFile,
}: {
  manifest: LibraryManifest
  onOpenFile: (file: BrowsableFile) => void
}) {
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | LibraryFile['preview']>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  const mediaFiles = useMemo(
    () => manifest.files.filter((file) => ['image', 'video', 'audio', 'voice'].includes(file.preview)).map(asArchiveFile),
    [manifest.files],
  )
  const counts = useMemo(
    () =>
      mediaFiles.reduce<Record<string, number>>((acc, file) => {
        acc[file.preview] = (acc[file.preview] ?? 0) + 1
        return acc
      }, {}),
    [mediaFiles],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return mediaFiles.filter((file) => {
      if (typeFilter !== 'all' && file.preview !== typeFilter) return false
      if (!q) return true
      return `${file.name}\n${file.category}\n${file.subcategory.join(' ')}\n${file.sourceApp}\n${file.sourcePath}`.toLowerCase().includes(q)
    })
  }, [mediaFiles, query, typeFilter])

  // jump back to the top whenever the visible set changes so the window math
  // never starts mid-scroll over a shorter list
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [query, typeFilter])

  // true virtualization: only rows near the viewport are ever mounted, so the
  // live <img> count stays bounded no matter how many thousands of files exist
  const win = useGridVirtualizer(scrollRef, filtered.length, { minCol: MIN_COL, rowH: ROW_H, gap: GAP, padX: PAD, padY: PAD })
  const shown = filtered.slice(win.start, win.end)

  return (
    <section className="media-review">
      <aside className="media-review-sidebar">
        <div className="clue-totals">
          <div>
            <span>媒体文件</span>
            <strong>{mediaFiles.length.toLocaleString()}</strong>
          </div>
          <div>
            <span>图片</span>
            <strong>{(counts.image ?? 0).toLocaleString()}</strong>
          </div>
          <div>
            <span>视频</span>
            <strong>{(counts.video ?? 0).toLocaleString()}</strong>
          </div>
          <div>
            <span>语音</span>
            <strong>{((counts.voice ?? 0) + (counts.audio ?? 0)).toLocaleString()}</strong>
          </div>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索媒体名、来源或路径" />
        </div>
        <div className="filter-row" role="group" aria-label="媒体类型">
          {(['all', 'image', 'video', 'voice'] as const).map((type) => (
            <button key={type} className={typeFilter === type ? 'active' : ''} onClick={() => setTypeFilter(type)} type="button">
              {type === 'all' ? '全部' : type === 'image' ? '图片' : type === 'video' ? '视频' : '语音'}
            </button>
          ))}
        </div>
        <p className="media-note">
          网格只加载服务端生成的小缩略图（视频取一帧做封面），并按视口回收卡片——无论上万文件都不会卡。点击任意卡片进入右侧完整预览。
        </p>
      </aside>
      <section className="media-grid-panel">
        <header>
          <div>
            <p className="eyebrow">归档副本 / 媒体复核</p>
            <h2>{filtered.length.toLocaleString()} 个可扫媒体</h2>
          </div>
          <span>{formatBytes(filtered.reduce((sum, file) => sum + file.size, 0))}</span>
        </header>
        <div className="media-grid" ref={scrollRef}>
          <div className="media-sizer" style={{ height: win.totalHeight }}>
            <div
              className="media-window"
              style={{ transform: `translateY(${win.translateY}px)`, gridTemplateColumns: `repeat(${win.cols}, minmax(0, 1fr))` }}
            >
              {shown.map((file) => (
                <button key={file.treeId} className={`media-card ${file.preview}`} onClick={() => onOpenFile(file)} type="button" title={file.sourcePath}>
                  <div className="media-thumb">
                    <MediaThumb file={file} />
                  </div>
                  <strong>{file.name}</strong>
                  <span>
                    {file.sourceApp} / {file.subcategory.join(' / ') || file.preview}
                  </span>
                  <em>
                    {formatBytes(file.size)} · {new Date(file.modified).toLocaleDateString()}
                  </em>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}
