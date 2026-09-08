import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { readText } from '../../shared/api/client'
import { textUrl, type BrowsableFile } from '../../utils/tree'

export function TextPreview({ file }: { file: BrowsableFile }) {
  const [text, setText] = useState('读取中...')
  useEffect(() => {
    const controller = new AbortController()
    readText(textUrl(file), { signal: controller.signal })
      .then(setText)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setText('文本预览失败。')
      })
    return () => controller.abort()
  }, [file])
  if (file.preview === 'markdown') {
    return (
      <article className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
          {text}
        </ReactMarkdown>
      </article>
    )
  }
  if (file.preview === 'html') {
    return <iframe className="html-preview" title={file.name} sandbox="" srcDoc={text} />
  }
  if (file.preview === 'json') {
    let formatted = text
    try {
      formatted = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      // Keep the raw text when a cache file only looks like JSON.
    }
    return <pre className="code-preview">{formatted}</pre>
  }
  return <pre className="code-preview">{text}</pre>
}
