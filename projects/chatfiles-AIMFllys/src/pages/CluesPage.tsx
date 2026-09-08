import { useNavigate } from 'react-router-dom'
import { libraryManifestSchema } from '../../shared/contracts/files'
import { chatClueDossierSchema, sourceFileManifestSchema } from '../../shared/contracts/uiData'
import { pathForTab } from '../app/navigation'
import { ChatClueReader } from '../components/workbenches/ChatClueReader'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyClueDossier, emptyManifest, emptySourceManifest } from '../utils/constants'
import '../styles/workbenches-layout.css'
import '../styles/workbenches-clue.css'

export default function CluesPage() {
  const navigate = useNavigate()
  const dossier = usePageData(apiEndpoints.chatClues, chatClueDossierSchema, emptyClueDossier)
  const sourceManifest = usePageData(
    apiEndpoints.sourceLibrary, sourceFileManifestSchema, emptySourceManifest,
  )
  const manifest = usePageData(apiEndpoints.library, libraryManifestSchema, emptyManifest)
  return (
    <PageDataNotice states={[dossier, sourceManifest, manifest]}>
      <ChatClueReader
        dossier={dossier.data}
        manifest={manifest.data}
        onOpenFile={(file) => navigate(pathForTab('files'), { state: { file } })}
        sourceManifest={sourceManifest.data}
      />
    </PageDataNotice>
  )
}
