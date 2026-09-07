import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActivityItem,
  ActivityStatus,
  AgentTurnEvent,
  AiEventEnvelope,
  ConversationMessage,
  ConversationSession,
  Mode,
} from './types';

const MODE_HINTS: Record<Mode, string> = {
  chat: 'read-only conversation',
  agent: 'asks before tools',
  plan: 'plan review, no edits',
};

const INITIAL_SESSION_ID = 'ai-session-1';

function freshSession(id: string, title: string): ConversationSession {
  return { id, title, subtitle: 'AI workspace', status: 'active' };
}

function createMessage(
  role: ConversationMessage['role'],
  content: string,
  meta?: string,
  streaming?: boolean,
): ConversationMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    meta,
    streaming,
  };
}

function decisionToStatus(decision?: string): ActivityStatus {
  if (decision === 'deny') return 'error';
  if (decision === 'ask') return 'waiting';
  return 'success';
}

/**
 * Reduce a single agent-turn event into the running activity timeline for a
 * session. Pure so it is trivially testable and order-stable.
 */
function reduceEvent(timeline: ActivityItem[], event: AgentTurnEvent, laneFor: (id: string) => number): ActivityItem[] {
  switch (event.type) {
    case 'turn_start':
      return [
        ...timeline,
        {
          id: `thinking-${event.round}`,
          kind: 'thinking',
          title: 'Thinking',
          status: 'loading',
          detail: `Reasoning (round ${event.round ?? 1})`,
        },
      ];
    case 'assistant_message': {
      // Resolve the most recent thinking row for this round to success.
      return timeline.map((item) =>
        item.kind === 'thinking' && item.status === 'loading'
          ? { ...item, status: 'success', detail: event.toolCallCount ? `Planned ${event.toolCallCount} tool call(s)` : 'Response ready' }
          : item,
      );
    }
    case 'tool_start': {
      const isSubagent = event.toolName === 'task';
      if (isSubagent) {
        const subId = event.subagentId || event.toolCallId || 'subagent';
        return [
          ...timeline,
          {
            id: `sub-${event.toolCallId}`,
            kind: 'subagent',
            title: event.subagentLabel || 'Subagent',
            status: 'loading',
            name: 'task',
            args: event.args,
            laneIndex: laneFor(subId),
            detail: 'Delegated task running',
          },
        ];
      }
      return [
        ...timeline,
        {
          id: `tool-${event.toolCallId}`,
          kind: 'tool',
          title: event.toolName || 'tool',
          name: event.toolName,
          status: 'loading',
          args: event.args,
          detail: 'Running',
        },
      ];
    }
    case 'tool_result': {
      const status = decisionToStatus(event.permissionDecision);
      const matchId = event.toolName === 'task' ? `sub-${event.toolCallId}` : `tool-${event.toolCallId}`;
      let matched = false;
      const next = timeline.map((item) => {
        if (item.id !== matchId) return item;
        matched = true;
        return {
          ...item,
          status,
          result: event.contentPreview || event.result,
          detail: status === 'error' ? event.reason || 'Denied' : 'Done',
          file: event.file || item.file,
        };
      });
      if (matched) return next;
      // tool_result without a matching start (e.g. replayed) -> append.
      return [
        ...timeline,
        {
          id: matchId,
          kind: event.toolName === 'task' ? 'subagent' : 'tool',
          title: event.toolName || 'tool',
          name: event.toolName,
          status,
          result: event.contentPreview || event.result,
          file: event.file,
        },
      ];
    }
    case 'permission_required':
      return [
        ...timeline,
        {
          id: `perm-${event.toolCallId}`,
          kind: 'permission',
          title: `Permission required: ${event.toolName || 'tool'}`,
          status: 'waiting',
          name: event.toolName,
          detail: event.reason || 'Approval needed before continuing.',
        },
      ];
    case 'plan_approval_required':
      return [
        ...timeline,
        {
          id: `plan-${event.toolCallId}`,
          kind: 'plan',
          title: 'Plan ready for review',
          status: 'waiting',
          detail: event.planPreview || 'A plan is waiting for approval.',
          result: event.permissionCount ? `${event.permissionCount} permission group(s)` : undefined,
        },
      ];
    case 'turn_complete':
      return timeline.map((item) =>
        item.kind === 'thinking' && item.status === 'loading'
          ? { ...item, status: event.status === 'max_tool_rounds' ? 'error' : 'success', detail: 'Turn complete' }
          : item,
      );
    default:
      return timeline;
  }
}

export function useConversationState() {
  const [sessions, setSessions] = useState<ConversationSession[]>([freshSession(INITIAL_SESSION_ID, 'New chat')]);
  const [activeSessionId, setActiveSessionId] = useState(INITIAL_SESSION_ID);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ConversationMessage[]>>({ [INITIAL_SESSION_ID]: [] });
  const [activityBySession, setActivityBySession] = useState<Record<string, ActivityItem[]>>({ [INITIAL_SESSION_ID]: [] });
  const [mode, setMode] = useState<Mode>('agent');
  const [busyBySession, setBusyBySession] = useState<Record<string, boolean>>({});

  // Stable lane assignment for concurrent subagents, per session.
  const lanesRef = useRef<Record<string, Record<string, number>>>({});

  const laneFor = useCallback((sessionId: string, subId: string): number => {
    const lanes = (lanesRef.current[sessionId] = lanesRef.current[sessionId] || {});
    if (lanes[subId] === undefined) lanes[subId] = Object.keys(lanes).length;
    return lanes[subId];
  }, []);

  // Subscribe once to the live agent-event stream and fan events into the
  // matching session timeline.
  useEffect(() => {
    const bridge = window.zeroOneCli;
    if (!bridge?.onAiEvent) return undefined;
    const unsubscribe = bridge.onAiEvent((payload: AiEventEnvelope) => {
      const { sessionId, event } = payload;
      setActivityBySession((current) => {
        const timeline = current[sessionId] || [];
        return {
          ...current,
          [sessionId]: reduceEvent(timeline, event, (subId) => laneFor(sessionId, subId)),
        };
      });
    });
    return unsubscribe;
  }, [laneFor]);

  const activeSession = sessions.find((session) => session.id === activeSessionId) || sessions[0];
  const messages = messagesBySession[activeSessionId] || [];
  const activity = activityBySession[activeSessionId] || [];
  const aiBusy = Boolean(busyBySession[activeSessionId]);
  const title = useMemo(
    () => `${activeSession?.title || 'New chat'} / ${MODE_HINTS[mode]}`,
    [activeSession?.title, mode],
  );

  function appendMessage(sessionId: string, message: ConversationMessage): void {
    setMessagesBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] || []), message],
    }));
  }

  function createSession(): void {
    const id = `ai-session-${Date.now()}`;
    setSessions((current) => [
      freshSession(id, 'New chat'),
      ...current.map((item) => ({ ...item, status: item.status === 'active' ? ('ready' as const) : item.status })),
    ]);
    setMessagesBySession((current) => ({ ...current, [id]: [] }));
    setActivityBySession((current) => ({ ...current, [id]: [] }));
    setActiveSessionId(id);
  }

  async function sendMessage(text: string): Promise<void> {
    const sessionId = activeSessionId;
    appendMessage(sessionId, createMessage('user', text, `/${mode}`));
    setBusyBySession((current) => ({ ...current, [sessionId]: true }));
    // Reset the live timeline for the new turn so orchestration reads cleanly.
    setActivityBySession((current) => ({ ...current, [sessionId]: [] }));
    lanesRef.current[sessionId] = {};

    // Give the session a human title from its first user turn.
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId && session.title === 'New chat'
          ? { ...session, title: text.slice(0, 42) || 'New chat', subtitle: `/${mode}` }
          : session,
      ),
    );

    // Optimistic streaming placeholder; replaced when the turn resolves.
    const pending = createMessage('assistant', '', 'streaming', true);
    appendMessage(sessionId, pending);

    try {
      if (!window.zeroOneCli?.sendAiMessage) {
        replaceMessage(sessionId, pending.id, createMessage('assistant', 'Desktop bridge is unavailable in browser preview.', 'offline'));
        return;
      }
      const response = await window.zeroOneCli.sendAiMessage({ sessionId, mode, text });
      const finalMessage = response.message
        ? { ...response.message, id: pending.id, streaming: false }
        : createMessage('assistant', response.output || response.error || 'No response returned.', response.ok ? 'done' : 'error');
      replaceMessage(sessionId, pending.id, { ...finalMessage, id: pending.id, streaming: false });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Embedded AI request failed.';
      replaceMessage(sessionId, pending.id, createMessage('assistant', detail, 'error'));
    } finally {
      setBusyBySession((current) => ({ ...current, [sessionId]: false }));
    }
  }

  function replaceMessage(sessionId: string, messageId: string, next: ConversationMessage): void {
    setMessagesBySession((current) => ({
      ...current,
      [sessionId]: (current[sessionId] || []).map((message) => (message.id === messageId ? next : message)),
    }));
  }

  return {
    activity,
    activeSessionId,
    aiBusy,
    createSession,
    messages,
    mode,
    sendMessage,
    sessions,
    setActiveSessionId,
    setMode,
    title,
  };
}
