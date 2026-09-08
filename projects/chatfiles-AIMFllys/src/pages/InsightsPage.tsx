import { insightsResponseSchema } from '../../shared/contracts/uiData'
import InsightsBoard from '../boards/Insights'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyInsights } from '../utils/constants'
import '../styles/boards-insights.css'

export default function InsightsPage() {
  const insights = usePageData(apiEndpoints.insights, insightsResponseSchema, emptyInsights)
  return <PageDataNotice states={[insights]}><InsightsBoard insights={insights.data} /></PageDataNotice>
}
