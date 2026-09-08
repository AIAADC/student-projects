import { useEffect, useState } from 'react'
import { Binary } from 'lucide-react'
import { fileInspectionSchema } from '../../../shared/contracts/filePreview'
import type { FileInspection } from '../../types'
import { readJson } from '../../shared/api/client'
import { formatBytes } from '../../utils/format'
import { inspectUrl, type BrowsableFile } from '../../utils/tree'

export function GenericFileInspector({ file }: { file: BrowsableFile }) {
  const [inspectionState, setInspectionState] = useState<{ fileId: string; data: FileInspection }>()
  const [errorState, setErrorState] = useState<{ fileId: string; message: string }>()
  useEffect(() => {
    const controller = new AbortController()
    readJson(inspectUrl(file), fileInspectionSchema, { signal: controller.signal })
      .then((data) => {
        setInspectionState({ fileId: file.id, data })
        setErrorState(undefined)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setErrorState({ fileId: file.id, message: '只读检查失败，可下载后用本地工具查看。' })
      })
    return () => controller.abort()
  }, [file])

  const error = errorState?.fileId === file.id ? errorState.message : ''
  const inspection = inspectionState?.fileId === file.id ? inspectionState.data : undefined

  if (error) {
    return (
      <div className="empty-preview format-note">
        <Binary size={38} />
        <h2>文件检查不可用</h2>
        <p>{error}</p>
      </div>
    )
  }
  if (!inspection) return <div className="empty-preview">读取文件头与可见字符串中...</div>

  return (
    <div className="file-inspector">
      <section className="db-status readable">
        <Binary size={28} />
        <div>
          <strong>通用只读检查</strong>
          <span>{inspection.mime} · {inspection.ext} · 抽样 {formatBytes(inspection.sampledBytes)}</span>
          <p>此格式无法在浏览器中完整渲染；这里展示文件头和可见字符串，帮助判断内容与来源，不写入、不解析执行。</p>
        </div>
      </section>
      <section className="db-header">
        <strong>文件头 HEX</strong>
        <code>{inspection.headerHex || '空文件'}</code>
      </section>
      <section className="db-header">
        <strong>文件头 ASCII</strong>
        <code>{inspection.headerAscii || '空文件'}</code>
      </section>
      <section className="inspector-strings">
        <header>
          <strong>可见字符串片段</strong>
          <span>{inspection.strings.length} 段</span>
        </header>
        {inspection.strings.length ? (
          inspection.strings.map((item) => (
            <article key={`${item.encoding}:${item.offset}:${item.text}`}>
              <span>{item.encoding} · offset {item.offset.toLocaleString()}</span>
              <p>{item.text}</p>
            </article>
          ))
        ) : (
          <p className="muted-note">前 {formatBytes(inspection.sampledBytes)} 内没有抽取到可靠可见字符串。</p>
        )}
      </section>
    </div>
  )
}
