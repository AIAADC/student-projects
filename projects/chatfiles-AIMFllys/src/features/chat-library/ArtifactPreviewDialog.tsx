import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ExternalLink, Loader2, X } from 'lucide-react'
import { chatArtifactMetadataSchema } from '../../../shared/contracts/chatLibrary'
import { formatArchiveTimestamp } from '../../../shared/time/archiveTime'
import type { ChatArtifactListItem, ChatArtifactMetadata, LibraryFile } from '../../types'
import { FilePreview } from '../../components/file-preview/FilePreview'
import type { BrowsableFile } from '../../utils/tree'
import { artifactAvailabilityDescription, previewForArtifactName } from './artifactModel'
import { nextDialogFocusIndex } from './dialogFocus'
import { readJson } from '../../shared/api/client'

const previewTypes = new Set<LibraryFile['preview']>([
  'image', 'video', 'audio', 'voice', 'pdf', 'docx', 'sheet', 'text', 'markdown',
  'code', 'html', 'json', 'presentation', 'archive', 'database', 'font', 'download',
])

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
}

function makeBackgroundInert(modal: HTMLElement) {
  const changed: Array<{ element: HTMLElement, inert: boolean, ariaHidden: string | null }> = []
  let branch: HTMLElement | null = modal

  while (branch.parentElement) {
    for (const sibling of branch.parentElement.children) {
      if (sibling === branch || !(sibling instanceof HTMLElement)) continue
      changed.push({
        element: sibling,
        inert: sibling.inert,
        ariaHidden: sibling.getAttribute('aria-hidden'),
      })
      sibling.inert = true
      sibling.setAttribute('aria-hidden', 'true')
    }
    branch = branch.parentElement
  }

  return () => {
    for (const { element, inert, ariaHidden } of changed) {
      element.inert = inert
      if (ariaHidden === null) element.removeAttribute('aria-hidden')
      else element.setAttribute('aria-hidden', ariaHidden)
    }
  }
}

function extension(name: string) {
  const match = name.match(/(\.[^./\\]+)$/u)
  return match?.[1]?.toLowerCase() ?? ''
}

function artifactFile(metadata: ChatArtifactMetadata): BrowsableFile | undefined {
  const contentUrl = metadata.capabilities.content
  if (!contentUrl) return undefined
  const normalizedPreview = previewForArtifactName(metadata.name, metadata.preview)
  const preview = previewTypes.has(normalizedPreview as LibraryFile['preview'])
    ? normalizedPreview as LibraryFile['preview']
    : 'download'
  return {
    id: metadata.id,
    treeId: `artifact:${metadata.id}`,
    storage: 'artifact',
    contentUrl,
    thumbnailUrl: metadata.capabilities.thumbnail,
    name: metadata.name,
    ext: extension(metadata.name),
    mime: '',
    size: metadata.size ?? 0,
    modified: new Date(metadata.createdAt * 1000).toISOString(),
    category: '素材',
    subcategory: [],
    archivePath: '',
    sourcePath: '',
    sourceApp: '微信',
    preview,
    sha256: metadata.id,
  }
}

export function ArtifactPreviewDialog({
  item,
  onClose,
  timeZone,
}: {
  item: ChatArtifactListItem
  onClose: () => void
  timeZone: string
}) {
  const [metadata, setMetadata] = useState<ChatArtifactMetadata>()
  const [error, setError] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const backdrop = backdropRef.current
    const dialog = dialogRef.current
    if (!backdrop || !dialog) return

    closeButtonRef.current?.focus()
    const restoreBackground = makeBackgroundInert(backdrop)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const controls = focusableElements(dialog)
      const currentIndex = controls.indexOf(document.activeElement as HTMLElement)
      const nextIndex = nextDialogFocusIndex(currentIndex, controls.length, event.shiftKey)
      if (nextIndex < 0) return
      event.preventDefault()
      controls[nextIndex]?.focus()
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) focusableElements(dialog)[0]?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      restoreBackground()
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    if (item.itemType !== 'artifact') return
    const controller = new AbortController()
    readJson(item.metadataUrl, chatArtifactMetadataSchema, { signal: controller.signal })
      .then(setMetadata)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError('素材详情暂时无法读取')
      })
    return () => controller.abort()
  }, [item])

  const file = useMemo(() => metadata ? artifactFile(metadata) : undefined, [metadata])
  const title = item.itemType === 'chatText' ? item.senderName || '聊天文字' : item.name
  const openUrl = metadata?.capabilities.content

  return (
    <div ref={backdropRef} className="artifact-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} aria-label={title} aria-modal="true" className="artifact-dialog" role="dialog">
        <header className="artifact-dialog-toolbar">
          <strong>{title}</strong>
          <div>
            {openUrl && (
              <a href={openUrl} rel="noreferrer" target="_blank" title="在新标签页打开">
                <ExternalLink size={18} />
              </a>
            )}
            <button ref={closeButtonRef} aria-label="关闭预览" onClick={onClose} title="关闭" type="button"><X size={19} /></button>
          </div>
        </header>
        <div className="artifact-dialog-body">
          {item.itemType === 'chatText' ? (
            <article className="chat-text-preview">
              <time>{formatArchiveTimestamp(item.createdAt, timeZone)}</time>
              <p>{item.content}</p>
            </article>
          ) : error ? (
            <div className="artifact-preview-state"><AlertCircle /><p>{error}</p></div>
          ) : !metadata ? (
            <div className="artifact-preview-state"><Loader2 className="spin" /><p>正在载入...</p></div>
          ) : file ? (
            <FilePreview file={file} />
          ) : (
            <div className="artifact-preview-state">
              <AlertCircle />
              <h2>暂不可预览</h2>
              <p>{artifactAvailabilityDescription(metadata.availability)}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
