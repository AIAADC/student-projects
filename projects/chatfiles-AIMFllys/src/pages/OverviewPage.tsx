import { useNavigate } from 'react-router-dom'
import { overviewSchema } from '../../shared/contracts/uiData'
import OverviewBoard from '../boards/Overview'
import { pathForTab } from '../app/navigation'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyOverview } from '../utils/constants'
import '../styles/boards-overview.css'

export default function OverviewPage() {
  const navigate = useNavigate()
  const overview = usePageData(apiEndpoints.overview, overviewSchema, emptyOverview)
  return (
    <PageDataNotice states={[overview]}>
      <OverviewBoard overview={overview.data} onGoto={(tab) => navigate(pathForTab(tab))} />
    </PageDataNotice>
  )
}
