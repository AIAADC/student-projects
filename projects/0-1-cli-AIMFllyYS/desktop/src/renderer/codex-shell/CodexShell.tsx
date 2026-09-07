import React from 'react';
import { ConversationView } from './ConversationView';
import { SessionRail } from './SessionRail';
import { useConversationState } from './useConversationState';

export function CodexShell(): React.ReactElement {
  const conversation = useConversationState();

  return (
    <main className="codexShell">
      <SessionRail
        sessions={conversation.sessions}
        activeId={conversation.activeSessionId}
        mode={conversation.mode}
        onSelect={conversation.setActiveSessionId}
        onNew={conversation.createSession}
      />
      <ConversationView
        title={conversation.title}
        mode={conversation.mode}
        messages={conversation.messages}
        activity={conversation.activity}
        busy={conversation.aiBusy}
        onMode={conversation.setMode}
        onSend={(text) => void conversation.sendMessage(text)}
      />
    </main>
  );
}
