import { useEffect, useRef } from 'react'
import { renderAsync } from 'docx-preview'
import { readBlob } from '../../shared/api/client'
import { fileUrl, type BrowsableFile } from '../../utils/tree'

export function DocxPreview({ file }: { file: BrowsableFile }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    const run = async () => {
      if (!ref.current) return
      ref.current.innerHTML = ''
      const blob = await readBlob(fileUrl(file), { signal: controller.signal })
      if (mounted && ref.current) await renderAsync(blob, ref.current, undefined, { className: 'docx-render' })
    }
    run().catch(() => {
      if (ref.current) ref.current.textContent = 'DOCX 预览失败，可使用右上角下载。'
    })
    return () => {
      controller.abort()
      mounted = false
    }
  }, [file])
  return <div className="docx-host" ref={ref} />
}
