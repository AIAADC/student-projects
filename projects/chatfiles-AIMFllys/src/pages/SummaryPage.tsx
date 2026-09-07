import { chatSummarySchema } from '../../shared/contracts/uiData'
import { SummaryReader } from '../components/workbenches/SummaryReader'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptySummary } from '../utils/constants'
import '../styles/summary.css'

export default function SummaryPage() {
  const summary = usePageData(apiEndpoints.summary, chatSummarySchema, emptySummary)
  return <PageDataNotice states={[summary]}><SummaryReader summary={summary.data} /></PageDataNotice>
}
