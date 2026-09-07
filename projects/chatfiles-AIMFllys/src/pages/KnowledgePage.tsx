import { CheckCircle2 } from 'lucide-react'
import { knowledgeBaseSchema } from '../../shared/contracts/uiData'
import { KnowledgeReader } from '../components/workbenches/KnowledgeReader'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyKnowledge } from '../utils/constants'
import '../styles/workbenches-layout.css'

export default function KnowledgePage() {
  const knowledge = usePageData(apiEndpoints.knowledge, knowledgeBaseSchema, emptyKnowledge)
  return (
    <PageDataNotice states={[knowledge]}>
      <section className="source-strip">
        {knowledge.data.sourceStatus.map((item) => (
          <div className={`source-card ${item.status}`} key={item.source}>
            <CheckCircle2 size={18} />
            <strong>{item.source}</strong>
            <p>{item.detail}</p>
          </div>
        ))}
      </section>
      <KnowledgeReader sections={knowledge.data.sections} />
    </PageDataNotice>
  )
}
