import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(name: string) {
  const target = path.resolve(process.cwd(), 'src/features/chat-timeline', name)
  assert.equal(fs.existsSync(target), true, `${name} must exist`)
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
}

test('renders chat text through a dedicated bounded timeline', () => {
  const workspace = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/chat-library/ArtifactWorkspace.tsx'),
    'utf8',
  )
  const hook = source('useChatTimeline.ts')
  const timeline = source('ChatTimeline.tsx')
  const model = source('timelineModel.ts')
  const publicTypes = fs.readFileSync(path.resolve(process.cwd(), 'shared/contracts/chatTimeline.ts'), 'utf8')
  assert.match(publicTypes, /TimelineMessage/u)
  assert.match(workspace, /tab === 'chatText'[\s\S]*?<ChatTimeline/u)
  assert.match(hook, /const MAX_PAGES = 5/u)
  assert.match(hook, /AbortController/u)
  assert.match(timeline, /className="timeline-message-name"/u)
  assert.match(timeline, /formatTimelineDateTime\(timestamp, timeline\.timeZone\)/u)
  assert.match(model, /dateStyle/u)
  assert.match(model, /second: '2-digit'/u)
  assert.match(hook, /timelinePageSchema/u)
  assert.match(hook, /timelineParticipantPageSchema/u)
  assert.match(hook, /timelineDayPageSchema/u)
  assert.match(hook, /apiEndpoints/u)
  assert.match(timeline, /<TimelineRail/u)
  assert.doesNotMatch(hook, /\.buckets/u)
})

test('provides a searchable accessible participant panel', () => {
  const people = source('PeoplePopover.tsx')
  assert.match(people, /role="dialog"/u)
  assert.match(people, /aria-label="筛选发言人"/u)
  assert.match(people, /participantMatches/u)
  assert.match(people, /onKeyDown/u)
})

test('renders every loaded archive day through a virtualized daily rail', () => {
  const rail = source('TimelineRail.tsx')
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/chat-timeline.css'), 'utf8')
  assert.match(rail, /TimelineDay/u)
  assert.match(rail, /useFixedListVirtualizer/u)
  assert.match(rail, /day\.date/u)
  assert.doesNotMatch(rail, /sampledBuckets/u)
  assert.doesNotMatch(rail, /slice\(2\)/u)
  assert.match(css, /\.timeline-date-scroll\s*\{[\s\S]*?overflow-y:\s*auto/u)
  assert.match(css, /\.timeline-date-buttons\s*\{[\s\S]*?position:\s*relative/u)
  assert.match(css, /\.timeline-date-buttons button\s*\{[\s\S]*?position:\s*absolute/u)
  assert.doesNotMatch(css, /\.timeline-date-buttons\s*\{[^}]*justify-content:\s*space-around/u)
})
