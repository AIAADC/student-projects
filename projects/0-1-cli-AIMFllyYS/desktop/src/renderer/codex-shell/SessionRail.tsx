import React, { useState } from 'react';
import { desktopActions } from '../action-catalog';
import type { DesktopAction } from '../action-catalog';
import { CommandPanel } from './CommandPanel';
import { StatusIcon } from './StatusIcon';
import type { ConversationSession, Mode } from './types';

export function SessionRail(props: {
  sessions: ConversationSession[];
  activeId: string;
  mode: Mode;
  onSelect: (id: string) => void;
  onNew: () => void;
}): React.ReactElement {
  const [activeCommand, setActiveCommand] = useState<DesktopAction | null>(null);

  return (
    <aside className="sessionRail">
      <div className="railBrand">
        <span className="railGlyph" aria-hidden="true">
          ✶
        </span>
        <div>
          <strong>0-1 CLI</strong>
          <small>AI workspace</small>
        </div>
      </div>

      <button className="newChatButton" type="button" onClick={props.onNew}>
        <span className="newChatPlus" aria-hidden="true">
          +
        </span>
        New chat
      </button>

      <nav className="sessionStack" aria-label="Conversations">
        {props.sessions.map((session) => {
          const selected = session.id === props.activeId;
          return (
            <button
              key={session.id}
              type="button"
              className={selected ? 'sessionRow selected' : 'sessionRow'}
              aria-current={selected ? 'true' : undefined}
              onClick={() => props.onSelect(session.id)}
            >
              <span className="sessionTitle">{session.title}</span>
              <small className="sessionMeta">{session.subtitle}</small>
              {selected && (
                <svg className="sessionCheck" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          );
        })}
      </nav>

      <section className="commandSection" aria-label="0-1 CLI commands">
        <header className="commandSectionHead">0-1 CLI</header>
        <div className="commandGrid">
          {desktopActions.map((action) => {
            const running = activeCommand?.id === action.id;
            return (
              <button
                key={action.id}
                type="button"
                className={running ? 'commandCard running' : 'commandCard'}
                onClick={() => setActiveCommand(action)}
              >
                <span className="commandCardTop">
                  <code className="commandCardCmd">{action.command}</code>
                  {running && <StatusIcon status="loading" size={12} />}
                </span>
                <strong className="commandCardTitle">{action.title}</strong>
                <span className="commandCardDesc">{action.description}</span>
              </button>
            );
          })}
        </div>
      </section>

      {activeCommand && <CommandPanel action={activeCommand} mode={props.mode} onClose={() => setActiveCommand(null)} />}
    </aside>
  );
}
