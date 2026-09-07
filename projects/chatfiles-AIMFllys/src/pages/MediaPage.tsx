import { useNavigate } from 'react-router-dom'
import { libraryManifestSchema } from '../../shared/contracts/files'
import { MediaReview } from '../components/workbenches/MediaReview'
import { pathForTab } from '../app/navigation'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyManifest } from '../utils/constants'
import '../styles/workbenches-layout.css'
import '../styles/workbenches-media.css'

export default function MediaPage() {
  const navigate = useNavigate()
  const manifest = usePageData(apiEndpoints.library, libraryManifestSchema, emptyManifest)
  return (
    <PageDataNotice states={[manifest]}>
      <MediaReview
        manifest={manifest.data}
        onOpenFile={(file) => navigate(pathForTab('files'), { state: { file } })}
      />
    </PageDataNotice>
  )
}
