import { useMemo } from 'react'
import { Search } from 'lucide-react'
import type { LibraryManifest, SourceFileManifest } from '../types'
import { FilePreview } from '../components/file-preview/FilePreview'
import { TreeView } from '../components/shared/TreeView'
import { formatBytes } from '../utils/format'
import { buildArchiveTree, buildSourceTree, type BrowsableFile } from '../utils/tree'

/** File board: scope switch (archive copies / full source index) + lazy folder
 *  tree on the left, full multi-format preview on the right. State is lifted to
 *  App so workbenches can deep-link into a specific file. */
export default function FilesBoard({
  manifest,
  sourceManifest,
  fileMode,
  setFileMode,
  selected,
  setSelected,
  filter,
  setFilter,
}: {
  manifest: LibraryManifest
  sourceManifest: SourceFileManifest
  fileMode: 'archive' | 'source'
  setFileMode: (mode: 'archive' | 'source') => void
  selected?: BrowsableFile
  setSelected: (file?: BrowsableFile) => void
  filter: string
  setFilter: (value: string) => void
}) {
  const archiveTree = useMemo(() => buildArchiveTree(manifest.files), [manifest.files])
  const sourceTree = useMemo(() => buildSourceTree(sourceManifest.files), [sourceManifest.files])
  const tree = fileMode === 'source' ? sourceTree : archiveTree

  return (
    <section className="files-layout">
      <aside className="file-sidebar">
        <div className="mode-switch" role="tablist" aria-label="文件范围">
          <button
            className={fileMode === 'archive' ? 'active' : ''}
            onClick={() => {
              setFileMode('archive')
              setSelected(undefined)
            }}
            type="button"
          >
            归档副本
            <span>{manifest.stats.archived.toLocaleString()}</span>
          </button>
          <button
            className={fileMode === 'source' ? 'active' : ''}
            onClick={() => {
              setFileMode('source')
              setSelected(undefined)
            }}
            type="button"
          >
            全量索引
            <span>{sourceManifest.stats.files.toLocaleString()}</span>
          </button>
        </div>
        <div className="search-box">
          <Search size={17} />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={fileMode === 'source' ? '搜索全部源文件路径' : '搜索归档文件或分类'}
          />
        </div>
        <div className="tree-meta">
          {fileMode === 'source'
            ? `${sourceManifest.roots.length} 个根目录 · ${formatBytes(sourceManifest.stats.bytes)} · 只读源文件`
            : `${formatBytes(manifest.stats.bytes)} · 去重归档副本`}
        </div>
        <TreeView node={tree} selected={selected?.treeId} onSelect={setSelected} filter={filter} />
      </aside>
      <FilePreview file={selected} />
    </section>
  )
}
