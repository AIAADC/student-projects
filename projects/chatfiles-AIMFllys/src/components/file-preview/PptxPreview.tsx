import { useEffect, useState } from 'react'
import { Presentation } from 'lucide-react'
import JSZip from 'jszip'
import { readArrayBuffer } from '../../shared/api/client'
import { fileUrl, type BrowsableFile } from '../../utils/tree'

export function PptxPreview({ file }: { file: BrowsableFile }) {
  const [slides, setSlides] = useState<Array<{ name: string; text: string }>>([])
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    readArrayBuffer(fileUrl(file), { signal: controller.signal })
      .then(async (buffer) => {
        const zip = await JSZip.loadAsync(buffer)
        const slideFiles = Object.values(zip.files)
          .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        const parsed = await Promise.all(
          slideFiles.map(async (entry) => {
            const xml = await entry.async('text')
            const doc = new DOMParser().parseFromString(xml, 'application/xml')
            const text = [...doc.getElementsByTagName('a:t')].map((node) => node.textContent ?? '').join('\n')
            return { name: entry.name.replace('ppt/slides/', '').replace('.xml', ''), text: text.trim() || '此页没有可抽取文本。' }
          }),
        )
        setSlides(parsed)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError('PPTX 结构读取失败，可下载原样副本。')
      })
    return () => controller.abort()
  }, [file])
  if (error) {
    return (
      <div className="empty-preview format-note">
        <Presentation size={38} />
        <h2>演示文稿已归档</h2>
        <p>{error}</p>
      </div>
    )
  }
  return (
    <div className="pptx-preview">
      <h2>演示文稿文本预览</h2>
      {slides.map((slide) => (
        <section key={slide.name}>
          <strong>{slide.name}</strong>
          <p>{slide.text}</p>
        </section>
      ))}
    </div>
  )
}
