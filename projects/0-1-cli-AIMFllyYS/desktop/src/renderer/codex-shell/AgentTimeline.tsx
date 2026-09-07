import React, { useState } from 'react';
import { FileChangeCard } from './FileChange';
import { StatusIcon } from './StatusIcon';
import { SUBAGENT_COLORS } from './types';
import type { ActivityItem } from './types';

function subagentColor(laneIndex?: number): string | undefined {
  if (laneIndex === undefined) return undefined;
  return SUBAGENT_COLORS[laneIndex % SUBAGENT_COLORS.length];
}

/** A single live tool / subagent / permission / plan row. */
function ToolActivityRow(props: { item: ActivityItem }): React.ReactElement {
  const { item } = props;
  const [open, setOpen] = useState(false);
  const hasDetails = Boolean(item.args || item.result || item.file);
  const accent = subagentColor(item.laneIndex);

  return (
    <article
      className={`activityRow kind-${item.kind} status-${item.status}`}
      style={accent ? ({ ['--subagent' as string]: accent } as React.CSSProperties) : undefined}
    >
      <button
        type="button"
        className="activityRowHead"
        onClick={() => hasDetails && setOpen((value) => !value)}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
      >
        {item.kind === 'subagent' && accent ? (
          <span className="laneDot" style={{ background: accent }} aria-hidden="true" />
        ) : (
          <StatusIcon status={item.status} />
        )}
        <span className="activityTitle">{item.title}</span>
        {item.name && <code className="activityName">{item.name}</code>}
        {item.detail && <span className="activityDetail">{item.detail}</span>}
        {hasDetails && <span className="activityChevron">{open ? '▾' : '▸'}</span>}
      </button>
      {open && (
        <div className="activityBody">
          {item.args && (
            <pre className="activityArgs">
              <code>{item.args}</code>
            </pre>
          )}
          {item.result && (
            <pre className="activityResult">
              <code>{item.result}</code>
            </pre>
          )}
          {item.file && <FileChangeCard file={item.file} />}
        </div>
      )}
    </article>
  );
}

/** Lanes keyed to reserved subagent colors for concurrent task delegation. */
function SubagentTimeline(props: { items: ActivityItem[] }): React.ReactElement | null {
  if (props.items.length === 0) return null;
  const lanes = new Map<number, ActivityItem[]>();
  props.items.forEach((item) => {
    const lane = item.laneIndex ?? 0;
    if (!lanes.has(lane)) lanes.set(lane, []);
    lanes.get(lane)!.push(item);
  });
  return (
    <div className="subagentTimeline" aria-label="Subagent delegation">
      {[...lanes.entries()].map(([lane, items]) => (
        <div key={lane} className="subagentLane" style={{ ['--subagent' as string]: subagentColor(lane) } as React.CSSProperties}>
          <span className="subagentLaneTag" style={{ background: subagentColor(lane) }}>
            {items[0]?.title || `Subagent ${lane + 1}`}
          </span>
          <div className="subagentLaneRows">
            {items.map((item) => (
              <ToolActivityRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function AgentTimeline(props: { items: ActivityItem[]; busy: boolean }): React.ReactElement | null {
  const subagents = props.items.filter((item) => item.kind === 'subagent');
  const main = props.items.filter((item) => item.kind !== 'subagent');

  if (props.items.length === 0 && !props.busy) return null;

  return (
    <section className="agentTimeline" aria-label="Agent orchestration">
      <header className="agentTimelineHead">
        <span className={props.busy ? 'thinkingDot active' : 'thinkingDot'} aria-hidden="true" />
        <span>{props.busy ? 'Agent working' : 'Run timeline'}</span>
      </header>
      <div className="agentTimelineRows">
        {main.map((item) => (
          <ToolActivityRow key={item.id} item={item} />
        ))}
      </div>
      <SubagentTimeline items={subagents} />
    </section>
  );
}
