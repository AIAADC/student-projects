import { insightsResponseSchema, knowledgeBaseSchema } from '../../shared/contracts/uiData'
import AcademicsBoard from '../boards/Academics'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyInsights, emptyKnowledge } from '../utils/constants'
import '../styles/boards-academics.css'
import '../styles/boards-insights.css'

export default function AcademicsPage() {
  const insights = usePageData(apiEndpoints.insights, insightsResponseSchema, emptyInsights)
  const knowledge = usePageData(apiEndpoints.knowledge, knowledgeBaseSchema, emptyKnowledge)
  return (
    <PageDataNotice states={[insights, knowledge]}>
      <AcademicsBoard insights={insights.data} knowledge={knowledge.data} />
    </PageDataNotice>
  )
}
