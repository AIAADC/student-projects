import { FileText } from 'lucide-react'
import { formatBytes } from '../../utils/format'
import { fileUrl, type BrowsableFile } from '../../utils/tree'

export function FontPreview({ file }: { file: BrowsableFile }) {
  const family = `chatfiles-font-${file.id}`
  const sample = 'ChatFiles 0123456789 ABC xyz 微信 QQ 学业 AI 创业'
  return (
    <div className="font-preview">
      <style>{`@font-face { font-family: "${family}"; src: url("${fileUrl(file)}"); font-display: block; }`}</style>
      <section className="db-status readable">
        <FileText size={28} />
        <div>
          <strong>字体样张</strong>
          <span>{file.ext || 'font'} · {formatBytes(file.size)} · {new Date(file.modified).toLocaleString()}</span>
          <p>直接加载该字体文件生成样张，方便判断图标字体、数学字体、品牌字体或中文字体资源。</p>
        </div>
      </section>
      <section className="font-specimen">
        <p className="font-line xl" style={{ fontFamily: family }}>{sample}</p>
        <p className="font-line lg" style={{ fontFamily: family }}>{sample}</p>
        <p className="font-line md" style={{ fontFamily: family }}>{sample}</p>
        <p className="font-line sm" style={{ fontFamily: family }}>{sample}</p>
      </section>
    </div>
  )
}
