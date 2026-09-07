import { Search, UserRound, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { TimelineParticipant } from '../../types'
import { formatTimelineDateTime, participantMatches } from './timelineModel'

export function PeoplePopover({
  participants,
  selected,
  timeZone,
  onSelect,
  onClose,
}: {
  participants: TimelineParticipant[]
  selected: string
  timeZone: string
  onSelect: (participant: TimelineParticipant | null) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(
    () => participants.filter((participant) => participantMatches(participant, query)),
    [participants, query],
  )
  return (
    <div className="timeline-people-layer">
      <button aria-label="关闭发言人筛选" className="timeline-people-scrim" onClick={onClose} type="button" />
      <aside
        aria-label="筛选发言人"
        className="timeline-people-popover"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose()
        }}
        role="dialog"
      >
        <header>
          <div><strong>发言人</strong><small>{participants.length.toLocaleString()} 人</small></div>
          <button aria-label="关闭" onClick={onClose} type="button"><X size={17} /></button>
        </header>
        <label className="timeline-people-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="搜索姓名"
            autoFocus
            maxLength={120}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索姓名或 ID"
            value={query}
          />
        </label>
        <div className="timeline-people-list">
          {selected && (
            <button className="timeline-person clear" onClick={() => onSelect(null)} type="button">
              <span><X size={15} /></span><strong>显示全部发言</strong>
            </button>
          )}
          {filtered.map((participant) => (
            <button
              aria-pressed={selected === participant.senderKey}
              className="timeline-person"
              key={participant.senderKey}
              onClick={() => onSelect(participant)}
              type="button"
            >
              <span><UserRound size={16} /></span>
              <span className="timeline-person-copy">
                <strong>{participant.name}</strong>
                <small>
                  {participant.messageCount.toLocaleString()} 条 · {formatTimelineDateTime(participant.lastTime, timeZone)}
                </small>
              </span>
            </button>
          ))}
          {!filtered.length && <p className="timeline-people-empty">没有匹配的姓名</p>}
        </div>
      </aside>
    </div>
  )
}
