import { useEffect, useState } from 'react'
import { Mic2 } from 'lucide-react'
import { voicePreviewSchema } from '../../../shared/contracts/filePreview'
import type { VoicePreview as VoicePreviewData } from '../../types'
import { readJson } from '../../shared/api/client'
import { formatBytes } from '../../utils/format'
import { voiceUrl, type BrowsableFile } from '../../utils/tree'

export function VoiceFilePreview({ file }: { file: BrowsableFile }) {
  const [previewState, setPreviewState] = useState<{ fileId: string; data: VoicePreviewData }>()
  const [errorState, setErrorState] = useState<{ fileId: string; message: string }>()
  useEffect(() => {
    const controller = new AbortController()
    readJson(voiceUrl(file), voicePreviewSchema, { signal: controller.signal })
      .then((data) => {
        setPreviewState({ fileId: file.id, data })
        setErrorState(undefined)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setErrorState({ fileId: file.id, message: '语音转码预览失败，可下载原始文件。' })
      })
    return () => controller.abort()
  }, [file])

  const error = errorState?.fileId === file.id ? errorState.message : undefined
  const preview = previewState?.fileId === file.id ? previewState.data : undefined
  if (error) {
    return (
      <div className="empty-preview format-note">
        <Mic2 size={38} />
        <h2>语音预览不可用</h2>
        <p>{error}</p>
      </div>
    )
  }
  if (!preview) return <div className="empty-preview">准备语音转码预览中...</div>

  return (
    <div className="voice-preview">
      <section className={preview.playable ? 'db-status readable' : 'db-status blocked'}>
        <Mic2 size={28} />
        <div>
          <strong>{preview.playable ? '聊天语音可播放' : '聊天语音暂不可播放'}</strong>
          <span>
            {preview.sourceFormat}{preview.codecHint ? ` · ${preview.codecHint}` : ''} · {formatBytes(preview.size)}
            {preview.durationSeconds ? ` · ${preview.durationSeconds.toFixed(1)} 秒` : ''}
          </span>
          <p>原始语音保持不变；标准 AMR 会只读转为 WAV 缓存在项目 work/audio-cache 中。若识别为 QQ SILK_V3 封装，则在这里保留格式边界和下载入口。</p>
        </div>
      </section>
      {preview.playable && preview.transcodedUrl ? (
        <section className="voice-card">
          <audio src={preview.transcodedUrl} controls />
        </section>
      ) : (
        <div className="empty-preview format-note">
          <p>{preview.error ?? '当前语音编码无法转码。'}</p>
        </div>
      )}
    </div>
  )
}
