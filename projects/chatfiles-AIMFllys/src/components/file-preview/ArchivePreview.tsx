import { useEffect, useState } from 'react'
import { Archive } from 'lucide-react'
import { archivePreviewSchema } from '../../../shared/contracts/filePreview'
import type { ArchivePreview as ArchivePreviewData } from '../../types'
import { readJson } from '../../shared/api/client'
import { formatBytes } from '../../utils/format'
import { archiveUrl, type BrowsableFile } from '../../utils/tree'

export function ArchiveFilePreview({ file }: { file: BrowsableFile }) {
  const [previewState, setPreviewState] = useState<{ fileId: string; data: ArchivePreviewData }>()
  const [errorState, setErrorState] = useState<{ fileId: string; message: string }>()
  useEffect(() => {
    const controller = new AbortController()
    readJson(archiveUrl(file), archivePreviewSchema, { signal: controller.signal })
      .then((data) => {
        setPreviewState({ fileId: file.id, data })
        setErrorState(undefined)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setErrorState({ fileId: file.id, message: '压缩包目录读取失败，可下载后用本地工具查看。' })
      })
    return () => controller.abort()
  }, [file])

  const error = errorState?.fileId === file.id ? errorState.message : undefined
  const preview = previewState?.fileId === file.id ? previewState.data : undefined
  if (error) {
    return (
      <div className="empty-preview format-note">
        <Archive size={38} />
        <h2>压缩包已归档</h2>
        <p>{error}</p>
      </div>
    )
  }
  if (!preview) return <div className="empty-preview">读取压缩包目录中...</div>
  if (!preview.readable) {
    return (
      <div className="zip-preview">
        <section className="archive-status blocked">
          <Archive size={34} />
          <div>
            <strong>压缩包目录暂不可读</strong>
            <span>{preview.format} · {formatBytes(preview.size)} · {new Date(preview.modified).toLocaleString()}</span>
            <p>{preview.error ?? '此格式或损坏状态当前无法只读列出目录，可下载原样副本。'}</p>
          </div>
        </section>
      </div>
    )
  }

  const shownEntries = preview.entries.slice(0, 300)
  return (
    <div className="zip-preview">
      <section className="archive-status readable">
        <Archive size={34} />
        <div>
          <strong>压缩包目录</strong>
          <span>{preview.format} · {formatBytes(preview.size)} · 显示 {shownEntries.length} / {preview.entries.length} 项</span>
        </div>
      </section>
      <table>
        <tbody>
          {shownEntries.map((entry) => (
            <tr key={entry.name}>
              <td>
                {entry.directory && <span className="entry-kind">DIR</span>}
                {entry.name}
              </td>
              <td>{entry.size === undefined ? '未知' : formatBytes(entry.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
