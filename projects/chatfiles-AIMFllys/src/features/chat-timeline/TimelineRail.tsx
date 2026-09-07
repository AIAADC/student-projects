import { Clock3, Loader2, UsersRound } from 'lucide-react'
import { useRef } from 'react'
import type { TimelineDay, TimelineParticipant } from '../../types'
import { useFixedListVirtualizer } from '../../hooks/useFixedListVirtualizer'

const DAY_HEIGHT = 32
const DAY_GAP = 4

export function TimelineRail({
  days,
  participants,
  activeDay,
  activeSender,
  hasMoreDays,
  loadingMoreDays,
  onJump,
  onLoadMoreDays,
  onOpenPeople,
}: {
  days: TimelineDay[]
  participants: TimelineParticipant[]
  activeDay: string
  activeSender: string
  hasMoreDays: boolean
  loadingMoreDays: boolean
  onJump: (day: TimelineDay) => void
  onLoadMoreDays: () => void
  onOpenPeople: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const virtual = useFixedListVirtualizer(scrollRef, listRef, days.length, {
    itemHeight: DAY_HEIGHT,
    gap: DAY_GAP,
    overscan: 8,
  })

  return (
    <aside className="timeline-rail" aria-label="每日与发言人导航">
      <button
        aria-label={`筛选发言人，共 ${participants.length} 人`}
        className={activeSender ? 'timeline-people-button is-active' : 'timeline-people-button'}
        onClick={onOpenPeople}
        title="按发言人筛选"
        type="button"
      >
        <UsersRound size={16} />
      </button>
      <div className="timeline-rail-line" aria-hidden="true" />
      <div
        className="timeline-date-scroll"
        onScroll={(event) => {
          const node = event.currentTarget
          if (hasMoreDays && !loadingMoreDays
            && node.scrollHeight - node.scrollTop - node.clientHeight < 160) onLoadMoreDays()
        }}
        ref={scrollRef}
      >
        <div className="timeline-date-buttons" ref={listRef} style={{ height: virtual.totalHeight }}>
          {virtual.indices.map((index) => {
            const day = days[index]
            if (!day) return null
            return (
              <button
                aria-current={activeDay === day.date ? 'date' : undefined}
                key={day.date}
                onClick={() => onJump(day)}
                style={{ transform: `translateY(${index * (DAY_HEIGHT + DAY_GAP)}px)` }}
                title={`${day.date} · ${day.messageCount.toLocaleString()} 条`}
                type="button"
              >
                <Clock3 size={11} />
                <span>{day.date}</span>
              </button>
            )
          })}
        </div>
        {loadingMoreDays && <Loader2 aria-label="载入更多日期" className="spin timeline-day-loader" size={14} />}
      </div>
    </aside>
  )
}
