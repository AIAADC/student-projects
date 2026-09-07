import { chatSynthesisSchema } from '../../shared/contracts/uiData'
import { ChatSynthesisReader } from '../components/workbenches/ChatSynthesisReader'
import { apiEndpoints } from '../shared/api/endpoints'
import { usePageData } from '../shared/api/usePageData'
import { PageDataNotice } from '../shared/api/PageDataNotice'
import { emptyChatSynthesis } from '../utils/constants'
import '../styles/workbenches-layout.css'
import '../styles/workbenches-synthesis.css'

export default function SynthesisPage() {
  const synthesis = usePageData(apiEndpoints.chatSynthesis, chatSynthesisSchema, emptyChatSynthesis)
  return (
    <PageDataNotice states={[synthesis]}>
      <ChatSynthesisReader synthesis={synthesis.data} />
    </PageDataNotice>
  )
}
