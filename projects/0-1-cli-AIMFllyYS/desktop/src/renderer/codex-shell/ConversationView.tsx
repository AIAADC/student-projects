import React from 'react';
import { ActivityStrip } from './ActivityStrip';
import { Composer } from './Composer';
import { MessageList } from './MessageList';
import type { ActivityItem, ConversationMessage, Mode } from './types';

const MODE_PILL_LABEL: Record<Mode, string> = {
  chat: 'Chat',
  agent: 'Build',
  plan: 'Plan',
};

export function ConversationView(props: {
  title: string;
  mode: Mode;
  messages: ConversationMessage[];
  activity: ActivityItem[];
  busy: boolean;
  onMode: (mode: Mode) => void;
  onSend: (text: string) => void;
}): React.ReactElement {
  return (
    <section className="conversationPane">
      <header className="conversationHeader">
        <div className="conversationHeading">
          <p>Workspace</p>
          <h1>{props.title}</h1>
        </div>
        <span className={`modePill mode-${props.mode}`}>{MODE_PILL_LABEL[props.mode]}</span>
      </header>
      <div className="conversationScroll">
        <MessageList messages={props.messages} />
        <ActivityStrip items={props.activity} busy={props.busy} />
      </div>
      <Composer mode={props.mode} busy={props.busy} onMode={props.onMode} onSend={props.onSend} />
    </section>
  );
}
