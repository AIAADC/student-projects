import { FileText, MessageSquareText } from 'lucide-react'
import { formatArchiveTimestamp } from '../../../shared/time/archiveTime'
import type { AgentCitation as Citation } from '../../types'

export function AgentCitation({
  citation,
  timeZone,
  onOpen,
}: {
  citation: Citation
  timeZone: string
  onOpen: (citation: Citation) => void
}) {
  return (
    <button className="agent-citation" onClick={() => onOpen(citation)} title="定位原始证据" type="button">
      {citation.kind === 'message' ? <MessageSquareText /> : <FileText />}
      <span>{citation.citation}</span>
      {citation.time !== undefined && <time>{formatArchiveTimestamp(citation.time, timeZone)}</time>}
    </button>
  )
}
