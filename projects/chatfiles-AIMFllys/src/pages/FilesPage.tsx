import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { libraryManifestSchema } from '../../shared/contracts/files'
import { sourceFileManifestSchema } from '../../shared/contracts/uiData'
import FilesBoard from '../boards/Files'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import type { BrowsableFile } from '../utils/tree'
import { emptyManifest, emptySourceManifest } from '../utils/constants'
import '../styles/files.css'
import '../styles/file-preview.css'

function routedFile(state: unknown) {
  if (!state || typeof state !== 'object' || !('file' in state)) return undefined
  const file = (state as { file?: unknown }).file
  if (!file || typeof file !== 'object') return undefined
  const candidate = file as Partial<BrowsableFile>
  return typeof candidate.name === 'string' && typeof candidate.treeId === 'string'
    ? file as BrowsableFile
    : undefined
}

export default function FilesPage() {
  const location = useLocation()
  const initialFile = routedFile(location.state)
  const manifest = usePageData(apiEndpoints.library, libraryManifestSchema, emptyManifest)
  const sourceManifest = usePageData(
    apiEndpoints.sourceLibrary, sourceFileManifestSchema, emptySourceManifest,
  )
  const [fileMode, setFileMode] = useState<'archive' | 'source'>(
    initialFile?.storage === 'source' ? 'source' : 'archive',
  )
  const [selected, setSelected] = useState(initialFile)
  const [filter, setFilter] = useState(initialFile?.name ?? '')

  return (
    <PageDataNotice states={[manifest, sourceManifest]}>
      <FilesBoard
        fileMode={fileMode}
        filter={filter}
        manifest={manifest.data}
        selected={selected}
        setFileMode={setFileMode}
        setFilter={setFilter}
        setSelected={setSelected}
        sourceManifest={sourceManifest.data}
      />
    </PageDataNotice>
  )
}
