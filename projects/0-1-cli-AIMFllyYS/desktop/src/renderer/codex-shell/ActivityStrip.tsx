import React from 'react';
import { AgentTimeline } from './AgentTimeline';
import type { ActivityItem } from './types';

/**
 * Thin compatibility wrapper. The static three-chip strip has been replaced by
 * the live AgentTimeline; this keeps the ConversationView import stable.
 */
export function ActivityStrip(props: { items: ActivityItem[]; busy: boolean }): React.ReactElement | null {
  return <AgentTimeline items={props.items} busy={props.busy} />;
}
