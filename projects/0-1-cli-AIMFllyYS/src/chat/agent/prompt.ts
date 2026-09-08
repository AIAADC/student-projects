import { ChatMessage } from '../../types';
import { SubagentTask } from './types';

const RECENT_MESSAGE_LIMIT = 6;
const RECENT_MESSAGE_CHAR_LIMIT = 500;

function formatList(label: string, values: string[] | undefined): string {
  return `${label}=${values && values.length ? values.join(',') : 'none'}`;
}

function truncateText(value: string, limit = RECENT_MESSAGE_CHAR_LIMIT): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 3)}...`;
}

function formatMessageContent(message: ChatMessage): string {
  if (message.tool_calls?.length) {
    const names = message.tool_calls.map((call) => call.function.name).join(',');
    return `[tool_calls: ${names}]`;
  }
  return truncateText(message.content || '');
}

export function formatParentRecentMessages(messages: ChatMessage[] | undefined, limit = RECENT_MESSAGE_LIMIT): string {
  if (!messages?.length) return 'none';
  return messages
    .slice(-limit)
    .map((message) => `[${message.role}] ${formatMessageContent(message)}`)
    .join('\n');
}

export function buildSubagentMessages(task: Pick<
  SubagentTask,
  'prompt'
  | 'mode'
  | 'permissionMode'
  | 'allowedTools'
  | 'disallowedTools'
  | 'skillIds'
  | 'modelId'
  | 'currentPlan'
  | 'currentPlanPath'
  | 'agentType'
  | 'agentSystemPrompt'
  | 'parentRecentMessages'
>): ChatMessage[] {
  const system = [
    '# Subagent Runtime',
    'You are a scoped local subagent inside 0-1 CLI.',
    'Work only on the delegated task. Do not change files unless the active mode and permission mode allow it.',
    'Inspect relevant context first, keep findings concise, and return a summary plus concrete notes.',
    '',
    '# Parent Context',
    `mode=${task.mode}`,
    `permissionMode=${task.permissionMode}`,
    `modelId=${task.modelId || 'default'}`,
    `agentType=${task.agentType || 'general-purpose'}`,
    formatList('allowedTools', task.allowedTools),
    formatList('disallowedTools', task.disallowedTools),
    formatList('skillIds', task.skillIds),
    '',
    '# Current Plan',
    task.currentPlanPath ? `Plan file: ${task.currentPlanPath}` : 'Plan file: none',
    task.currentPlan?.trim() || 'none',
    '',
    '# Parent Recent Messages',
    formatParentRecentMessages(task.parentRecentMessages),
    task.agentSystemPrompt?.trim()
      ? ['', '# Agent Definition', task.agentSystemPrompt.trim()].join('\n')
      : '',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Delegated task:\n${task.prompt}` },
  ];
}
