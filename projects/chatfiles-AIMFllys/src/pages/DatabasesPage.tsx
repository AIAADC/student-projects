import { useNavigate } from 'react-router-dom'
import { databaseAnalysisSchema, sourceFileManifestSchema } from '../../shared/contracts/uiData'
import { pathForTab } from '../app/navigation'
import { DatabaseWorkbench } from '../components/workbenches/DatabaseWorkbench'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyDatabaseAnalysis, emptySourceManifest } from '../utils/constants'
import '../styles/workbenches-layout.css'
import '../styles/workbenches-database-value.css'

export default function DatabasesPage() {
  const navigate = useNavigate()
  const analysis = usePageData(
    apiEndpoints.databaseAnalysis, databaseAnalysisSchema, emptyDatabaseAnalysis,
  )
  const sourceManifest = usePageData(
    apiEndpoints.sourceLibrary, sourceFileManifestSchema, emptySourceManifest,
  )
  return (
    <PageDataNotice states={[analysis, sourceManifest]}>
      <DatabaseWorkbench
        analysis={analysis.data}
        onOpenFile={(file) => navigate(pathForTab('files'), { state: { file } })}
        sourceManifest={sourceManifest.data}
      />
    </PageDataNotice>
  )
}
