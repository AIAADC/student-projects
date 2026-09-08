import { Check, Loader2, Search, TriangleAlert } from 'lucide-react'

export type AgentProgressEntry = {
  key: string
  label: string
  status: 'running' | 'complete' | 'rejected' | 'duplicate'
}

export function AgentProgress({ entries }: { entries: AgentProgressEntry[] }) {
  if (!entries.length) return null
  return (
    <div className="agent-progress" aria-label="智能体执行进度" aria-live="polite">
      {entries.slice(-8).map((entry) => (
        <span data-status={entry.status} key={entry.key}>
          {entry.status === 'running' ? <Loader2 className="spin" />
            : entry.status === 'complete' ? <Check />
              : entry.status === 'duplicate' ? <Search /> : <TriangleAlert />}
          {entry.label}
        </span>
      ))}
    </div>
  )
}
