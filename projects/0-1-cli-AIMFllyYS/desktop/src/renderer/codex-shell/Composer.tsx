import React, { useRef, useState } from 'react';
import type { Mode } from './types';

interface ModeTab {
  mode: Mode;
  label: string;
  hint: string;
}

// Claude-style mode tabs mapped onto the CLI's chat/agent/plan modes.
// Build = agent (asks before tools), Plan = plan (no edits), Chat = read-only.
const MODE_TABS: ModeTab[] = [
  { mode: 'chat', label: 'Chat', hint: 'read-only conversation' },
  { mode: 'agent', label: 'Build', hint: 'asks before tools' },
  { mode: 'plan', label: 'Plan', hint: 'plan review, no edits' },
];

export function Composer(props: {
  mode: Mode;
  busy: boolean;
  onMode: (mode: Mode) => void;
  onSend: (text: string) => void;
}): React.ReactElement {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function submit(): void {
    const value = text.trim();
    if (!value || props.busy) return;
    setText('');
    props.onSend(value);
  }

  return (
    <footer className={`composerBar mode-${props.mode}`}>
      <div className="composerToolbar">
        <div className="modeTabs" role="tablist" aria-label="AI mode">
          {MODE_TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={props.mode === tab.mode}
              className={props.mode === tab.mode ? `modeTab selected mode-${tab.mode}` : 'modeTab'}
              title={tab.hint}
              onClick={() => props.onMode(tab.mode)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`composerInputWrap mode-${props.mode}`}>
        <textarea
          ref={textareaRef}
          className="composerTextarea"
          rows={3}
          value={text}
          placeholder="Ask 0-1 CLI to inspect, plan, edit, or explain…"
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button className="sendButton" type="button" disabled={props.busy || !text.trim()} onClick={submit} aria-label="Send message">
          {props.busy ? (
            <span className="sendSpinner" aria-hidden="true" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </footer>
  );
}
