import React from 'react';
import type { ActivityStatus } from './types';

/**
 * Compact status glyph used across command cards and the agent timeline.
 * loading -> spinner, success -> check, error -> cross, waiting -> dot,
 * info -> neutral dot.
 */
export function StatusIcon(props: { status: ActivityStatus; size?: number }): React.ReactElement {
  const size = props.size ?? 14;
  if (props.status === 'loading') {
    return <span className="statusIcon loading" style={{ width: size, height: size }} aria-label="running" />;
  }
  if (props.status === 'success') {
    return (
      <svg className="statusIcon success" width={size} height={size} viewBox="0 0 16 16" aria-label="done">
        <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (props.status === 'error') {
    return (
      <svg className="statusIcon error" width={size} height={size} viewBox="0 0 16 16" aria-label="error">
        <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (props.status === 'waiting') {
    return <span className="statusIcon waiting" style={{ width: size, height: size }} aria-label="waiting" />;
  }
  return <span className="statusIcon info" style={{ width: size, height: size }} aria-label="info" />;
}
