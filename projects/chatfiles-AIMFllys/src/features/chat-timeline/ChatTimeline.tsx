import { Loader2, MessageCircle, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { archiveDay } from '../../../shared/time/archiveTime'
import type { TimelineMessage } from '../../types'
import { firstCodePoint } from '../chat-library/artifactModel'
import type { ChatRouteState } from './chatRouteState'
import {
  formatTimelineClock,
  formatTimelineDateTime,
  groupTimelineMessages,
  senderKeyForMessage,
} from './timelineModel'
import { PeoplePopover } from './PeoplePopover'
import { TimelineRail } from './TimelineRail'
import { useChatTimeline } from './useChatTimeline'

export function ChatTimeline({
  conversationId,
  routeState,
  onRouteStateChange,
}: {
  conversationId: string
  routeState: ChatRouteState
  onRouteStateChange: (patch: Partial<ChatRouteState>) => void
}) {
  const timeline = useChatTimeline(conversationId, {
    query: routeState.query,
    sender: routeState.sender,
    ...(routeState.messageUid ? { focusMessageUid: routeState.messageUid } : {}),
  })
  const [peopleOpen, setPeopleOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const renderItems = useMemo(
    () => groupTimelineMessages(timeline.messages, timeline.timeZone),
    [timeline.messages, timeline.timeZone],
  )

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || timeline.loading) return
    const target = timeline.focusUid ? document.getElementById(`timeline-${timeline.focusUid}`) : null
    if (target) {
      target.scrollIntoView({ block: 'center' })
      return
    }
    scroller.scrollTop = scroller.scrollHeight
  }, [timeline.focusUid, timeline.loading, timeline.revision])

  const loadOlder = async () => {
    const scroller = scrollRef.current
    if (!scroller) return
    const before = scroller.scrollHeight
    if (await timeline.loadOlder()) {
      requestAnimationFrame(() => { scroller.scrollTop += scroller.scrollHeight - before })
    }
  }

  const filterFromMessage = (message: TimelineMessage) => {
    const timestamp = message.occurred_at_epoch_s ?? message.time
    onRouteStateChange({
      sender: senderKeyForMessage(message),
      day: message.archive_day ?? archiveDay(timestamp, timeline.timeZone),
      messageUid: message.message_uid,
    })
  }

  return (
    <section className="chat-timeline" aria-label="聊天文字时间轴">
      <div className="timeline-main">
        <div className="timeline-toolbar">
          <span>{timeline.messages.length.toLocaleString()} 条已载入</span>
          {timeline.sender && (
            <button onClick={() => onRouteStateChange({ sender: '' })} type="button">
              仅看 {timeline.participants.find((person) => person.senderKey === timeline.sender)?.name ?? timeline.sender}
              <X size={13} />
            </button>
          )}
        </div>
        <div
          className="timeline-scroll"
          onScroll={(event) => {
            const node = event.currentTarget
            if (node.scrollTop < 180 && timeline.hasOlder && !timeline.loadingOlder) void loadOlder()
            if (node.scrollHeight - node.scrollTop - node.clientHeight < 180
              && timeline.hasNewer && !timeline.loadingNewer) void timeline.loadNewer()
          }}
          ref={scrollRef}
        >
          {timeline.loading ? (
            <div className="timeline-state"><Loader2 className="spin" size={20} /><span>正在整理时间轴…</span></div>
          ) : timeline.error && !timeline.messages.length ? (
            <div className="timeline-state"><span>{timeline.error}</span></div>
          ) : !timeline.messages.length ? (
            <div className="timeline-state"><MessageCircle size={24} /><span>没有匹配的聊天文字</span></div>
          ) : (
            <div className="timeline-thread">
              {timeline.loadingOlder && <div className="timeline-page-loader"><Loader2 className="spin" size={13} /> 载入更早记录</div>}
              {renderItems.map((item) => {
                if (item.kind === 'day') {
                  return <div className="timeline-day" key={item.key}><time>{item.label}</time></div>
                }
                const timestamp = item.message.occurred_at_epoch_s ?? item.message.time
                return (
                  <article
                    className={`timeline-message${item.showIdentity ? ' starts-run' : ''}${timeline.focusUid === item.message.message_uid ? ' is-highlighted' : ''}`}
                    id={`timeline-${item.message.message_uid}`}
                    key={item.key}
                  >
                    <span className="timeline-message-avatar">{firstCodePoint(item.message.sender_name, '聊')}</span>
                    <div className="timeline-message-content">
                      <div className="timeline-message-meta">
                        <button className="timeline-message-name" onClick={() => filterFromMessage(item.message)} type="button">
                          {item.message.sender_name || item.message.sender || '未知发送者'}
                        </button>
                        <time
                          dateTime={new Date(timestamp * 1000).toISOString()}
                          title={formatTimelineDateTime(timestamp, timeline.timeZone)}
                        >
                          {formatTimelineClock(timestamp, timeline.timeZone)}
                        </time>
                      </div>
                      <p>{item.message.text || `[${item.message.type_label || '消息'}]`}</p>
                    </div>
                  </article>
                )
              })}
              {timeline.loadingNewer && <div className="timeline-page-loader"><Loader2 className="spin" size={13} /> 载入更新记录</div>}
            </div>
          )}
        </div>
      </div>
      <TimelineRail
        activeDay={routeState.day}
        activeSender={timeline.sender}
        days={timeline.days}
        hasMoreDays={timeline.hasMoreDays}
        loadingMoreDays={timeline.loadingMoreDays}
        onJump={(day) => onRouteStateChange({ day: day.date, messageUid: day.firstMessageUid })}
        onLoadMoreDays={() => { void timeline.loadMoreDays() }}
        onOpenPeople={() => setPeopleOpen(true)}
        participants={timeline.participants}
      />
      {peopleOpen && (
        <PeoplePopover
          onClose={() => setPeopleOpen(false)}
          onSelect={(participant) => {
            onRouteStateChange({ sender: participant?.senderKey ?? '' })
            setPeopleOpen(false)
          }}
          participants={timeline.participants}
          selected={timeline.sender}
          timeZone={timeline.timeZone}
        />
      )}
    </section>
  )
}
