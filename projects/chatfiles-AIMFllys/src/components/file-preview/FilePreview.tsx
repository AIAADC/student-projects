import { Download, Layers3 } from 'lucide-react'
import { formatBytes } from '../../utils/format'
import { fileUrl, isVoiceFile, type BrowsableFile } from '../../utils/tree'
import { ArchiveFilePreview } from './ArchivePreview'
import { DatabaseFilePreview } from './DatabasePreview'
import { DocxPreview } from './DocxPreview'
import { FontPreview } from './FontPreview'
import { GenericFileInspector } from './GenericInspector'
import { ImageFilePreview } from './ImagePreview'
import { PptxPreview } from './PptxPreview'
import { SheetPreview } from './SheetPreview'
import { TextPreview } from './TextPreview'
import { VoiceFilePreview } from './VoicePreview'

export function FilePreview({ file }: { file?: BrowsableFile }) {
  if (!file) {
    return (
      <div className="empty-preview">
        <Layers3 size={42} />
        <h2>选择一个文件</h2>
        <p>左侧可在归档副本和全量源文件索引之间切换，点击文件后会在这里内部渲染。</p>
      </div>
    )
  }
  return (
    <section className="preview-panel">
      <header className="preview-header">
        <div>
          <p className="eyebrow">
            {file.storage === 'artifact'
              ? `会话素材 / ${file.category}`
              : file.storage === 'source'
              ? `源文件 / ${file.sourceApp} / ${file.relativePath ?? file.name}`
              : `${file.sourceApp} / ${file.category} / ${file.subcategory.join(' / ')}`}
          </p>
          <h2>{file.name}</h2>
          <span>{formatBytes(file.size)} · {new Date(file.modified).toLocaleString()}</span>
        </div>
        <a className="icon-link" href={fileUrl(file)} download title={file.storage === 'source' ? '下载源文件副本' : '下载原样副本'}>
          <Download size={18} />
        </a>
      </header>
      <div className="preview-surface">
        {file.preview === 'image' && <ImageFilePreview file={file} />}
        {file.preview === 'video' && <video className="media-preview" src={fileUrl(file)} controls />}
        {file.preview === 'audio' && <audio className="audio-preview" src={fileUrl(file)} controls />}
        {(file.preview === 'voice' || isVoiceFile(file)) && <VoiceFilePreview file={file} />}
        {file.preview === 'pdf' && <iframe title={file.name} className="pdf-preview" src={fileUrl(file)} />}
        {file.preview === 'docx' && <DocxPreview file={file} />}
        {file.preview === 'sheet' && <SheetPreview file={file} />}
        {['text', 'markdown', 'code', 'html', 'json'].includes(file.preview) && <TextPreview file={file} />}
        {file.preview === 'presentation' && <PptxPreview file={file} />}
        {file.preview === 'font' && <FontPreview file={file} />}
        {file.preview === 'archive' && <ArchiveFilePreview file={file} />}
        {file.preview === 'database' && <DatabaseFilePreview file={file} />}
        {file.preview === 'download' && !isVoiceFile(file) && <GenericFileInspector file={file} />}
      </div>
    </section>
  )
}
