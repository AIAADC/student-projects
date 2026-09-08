import { Globe2 } from 'lucide-react'
import { useLinkPreview } from './useLinkPreview'

function domainFromUrl(url: string | null) {
  if (!url) return '链接地址不可用'
  try {
    return new URL(url).hostname || '链接地址不可用'
  } catch {
    return '链接地址不可用'
  }
}

export function LinkPreviewCard({
  artifactId,
  stateLabel,
  url,
}: {
  artifactId: string
  stateLabel: string
  url: string | null
}) {
  const { data, ref, status } = useLinkPreview(artifactId, Boolean(url))
  const domain = data?.domain || domainFromUrl(url)
  const ready = data?.status === 'ready' && Boolean(data.title)

  return (
    <span className="artifact-card-preview link-preview" data-status={status} ref={ref}>
      <span className="artifact-type">链接</span>
      <span className="artifact-state">{stateLabel}</span>
      <span className="link-preview-icon" aria-hidden="true"><Globe2 /></span>
      <span className="link-preview-copy">
        <strong>{ready ? data.title : domain}</strong>
        {ready && data.description ? (
          <span className="link-preview-description">{data.description}</span>
        ) : (
          <span className="link-preview-description">
            {status === 'loading' ? '正在读取网页介绍…' : '暂未取得网页介绍'}
          </span>
        )}
        <small>{ready && data.siteName ? `${data.siteName} · ${domain}` : domain}</small>
      </span>
    </span>
  )
}
