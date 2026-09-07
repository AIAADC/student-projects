import { useNavigate } from 'react-router-dom'
import { sourceFileManifestSchema, valueCandidateIndexSchema } from '../../shared/contracts/uiData'
import { pathForTab } from '../app/navigation'
import { ValueCandidateWorkbench } from '../components/workbenches/ValueCandidateWorkbench'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptySourceManifest, emptyValueCandidates } from '../utils/constants'
import '../styles/workbenches-layout.css'
import '../styles/workbenches-database-value.css'

export default function CandidatesPage() {
  const navigate = useNavigate()
  const index = usePageData(apiEndpoints.valueCandidates, valueCandidateIndexSchema, emptyValueCandidates)
  const sourceManifest = usePageData(
    apiEndpoints.sourceLibrary, sourceFileManifestSchema, emptySourceManifest,
  )
  return (
    <PageDataNotice states={[index, sourceManifest]}>
      <ValueCandidateWorkbench
        index={index.data}
        onOpenFile={(file) => navigate(pathForTab('files'), { state: { file } })}
        sourceManifest={sourceManifest.data}
      />
    </PageDataNotice>
  )
}
