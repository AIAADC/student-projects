import { AiMode, PermissionMode } from '../session';
import { getModeConfig } from '../modes';
import { glyphs } from '../terminal-ui';
import {
  INDENT,
  PANEL_WIDTH,
  divider,
  line,
  panelDivider,
  renderByline,
  renderInputGuide,
  renderKeyboardHint,
  truncateVisible,
  ui,
  UI_WIDTH,
  visibleLength,
} from './theme';
import type { RecentDenial } from '../permissions/engine';
import type { FileChangeOperation } from '../tools/fs-write';

export interface FileChangePreviewInput {
  tool: string;
  filePath: string;
  operation: FileChangeOperation;
  added: number;
  removed: number;
  changed: number;
}

export interface RecentDenialsInput {
  denials: RecentDenial[];
}

export interface StatusHeaderInput {
  project: string;
  mode: AiMode;
  permissionMode: PermissionMode;
  model: string;
  activeSkills?: number;
  runningSubagents?: number;
}

export interface PermissionBoxInput {
  tool: string;
  action: 'allow' | 'ask' | 'deny';
  reason: string;
}

export interface PlanApprovalPanelInput {
  plan: string;
  planFilePath?: string;
  permissions?: Array<{
    action: string;
    reason?: string;
  }>;
}

export interface TimelineEntryInput {
  kind: 'tool' | 'subagent' | 'search' | 'model';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  label: string;
  detail?: string;
}

export interface ThinkingStateInput {
  label: string;
  status: 'thinking' | 'reasoning' | 'responding' | 'waiting';
  model?: string;
  mode?: AiMode;
  detail?: string;
}

export interface AgentProgressEventInput {
  event: {
    type: string;
    round?: number;
    messageCount?: number;
    content?: string;
    toolCallCount?: number;
    toolCallId?: string;
    toolName?: string;
    permissionDecision?: string;
    contentPreview?: string;
    reason?: string;
    status?: string;
    toolResultCount?: number;
    permissionCount?: number;
    planPreview?: string;
  };
  model?: string;
  mode?: AiMode;
}

export interface SubagentTimelineInput {
  id: string;
  status: TimelineEntryInput['status'];
  prompt: string;
  summary?: string;
  toolCount?: number;
  permissionCount?: number;
  elapsedMs?: number;
  error?: string;
}

function renderPanelBody(lines: string[]): string[] {
  return lines.map((entry) => `${INDENT}${entry}`);
}

function truncateVisibleEnd(value: string, maxWidth: number): string {
  if (visibleLength(value) <= maxWidth) return value;
  const ellipsis = '…';
  const ellipsisWidth = visibleLength(ellipsis);
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, Math.max(0, maxWidth));
  let width = ellipsisWidth;
  let output = '';
  for (const char of Array.from(value).reverse()) {
    const nextWidth = visibleLength(char);
    if (width + nextWidth > maxWidth) break;
    output = char + output;
    width += nextWidth;
  }
  return ellipsis + output;
}

export function renderModePill(mode: AiMode, permissionMode: PermissionMode): string {
  const config = getModeConfig(mode);
  const label = `[${config.symbol} ${config.shortTitle}]`;
  const suffix = permissionMode === 'bypass'
    ? ' bypass'
    : permissionMode === 'plan'
      ? ' no edits'
      : ` ${config.hint}`;
  const text = `${label}${suffix}`;
  if (config.color === 'plan') return ui.accent(text);
  if (config.color === 'permission') return ui.warning(text);
  if (config.color === 'danger') return ui.danger(text);
  return ui.strong(text);
}

export function renderStatusHeader(input: StatusHeaderInput): string {
  const title = `${ui.brand('0-1 CLI')} ${ui.muted(glyphs.separator)} ${ui.strong(truncateVisible(input.project, 28))}`;
  const meta = [
    renderModePill(input.mode, input.permissionMode),
    `model ${truncateVisible(input.model, 10)}`,
    `技能 ${input.activeSkills || 0}`,
    `子任务 ${input.runningSubagents || 0}`,
  ].join('  ');

  return [
    '',
    `${INDENT}${truncateVisible(title, UI_WIDTH)}`,
    `${INDENT}${ui.muted(truncateVisible(meta, UI_WIDTH))}`,
    `${INDENT}${line(UI_WIDTH)}`,
    renderKeyboardHintRow(),
  ].join('\n');
}

export function renderPermissionBox(input: PermissionBoxInput): string {
  const actionColor = input.action === 'allow' ? ui.success : input.action === 'deny' ? ui.danger : ui.warning;
  return [
    '',
    `${INDENT}${ui.warning('Permission')} ${actionColor(input.action.toUpperCase())}`,
    `${INDENT}${panelDivider()}`,
    ...renderPanelBody([
      `tool   ${ui.strong(truncateVisible(input.tool, 40))}`,
      `reason ${ui.muted(truncateVisible(input.reason, 56))}`,
    ]),
    `${INDENT}${renderByline([ui.success('[允许]'), ui.danger('[拒绝]'), ui.muted('[本次会话记住]')])}`,
    `${INDENT}${renderInputGuide([
      { shortcut: 'Enter', action: 'allow once', bold: true },
      { shortcut: 'Esc', action: 'reject' },
    ])}`,
  ].join('\n');
}

export function renderPlanApprovalPanel(input: PlanApprovalPanelInput): string {
  const planLines = input.plan.trim()
    ? input.plan.trim().split(/\r?\n/)
    : ['No plan content was provided.'];
  const output = [
    '',
    `${INDENT}${ui.accent('Ready to code?')}`,
    `${INDENT}${panelDivider()}`,
    ...renderPanelBody([
      ui.strong("Here is 0-1 CLI's plan:"),
      ui.muted(glyphs.divider.repeat(PANEL_WIDTH)),
      ...planLines.map((planLine) => `${ui.muted('|')} ${truncateVisible(planLine, 58)}`),
      ui.muted(glyphs.divider.repeat(PANEL_WIDTH)),
    ]),
  ];

  if (input.planFilePath) {
    output.push(`${INDENT}${ui.muted('Plan file:')} ${truncateVisible(input.planFilePath, 46)}`);
  }

  const permissions = input.permissions || [];
  if (permissions.length) {
    output.push(`${INDENT}${ui.strong('Requested permissions:')}`);
    permissions.forEach((permission) => {
      const detail = permission.reason ? `${permission.action}: ${permission.reason}` : permission.action;
      output.push(`${INDENT}${ui.muted(glyphs.bullet)} ${truncateVisible(detail, 58)}`);
    });
    output.push(`${INDENT}${ui.muted(truncateVisible('Permissions listed here are not auto-granted.', 62))}`);
  }

  output.push(
    `${INDENT}${ui.muted('0-1 CLI has written up a plan and is ready to execute.')}`,
    `${INDENT}${renderByline([ui.success('[Y] Yes, manually approve edits'), ui.danger('[N] No, keep planning')])}`,
    `${INDENT}${ui.muted(truncateVisible('Tip: edit the plan file first if you want changes before approval.', 62))}`,
    `${INDENT}${renderInputGuide([
      { shortcut: 'Y', action: 'approve plan', bold: true },
      { shortcut: 'N', action: 'keep planning' },
    ])}`,
  );

  return output.join('\n');
}

export function renderTimelineEntry(input: TimelineEntryInput): string {
  const icon = input.kind === 'subagent' ? glyphs.diamondOpen : input.kind === 'tool' ? glyphs.diamond : glyphs.bullet;
  const labelText = truncateVisible(input.label, 18);
  const status = input.status === 'completed'
    ? ui.success(input.status)
    : input.status === 'failed' || input.status === 'cancelled'
      ? ui.danger(input.status)
      : ui.warning(input.status);
  const plainPrefix = `${INDENT}${icon} ${labelText} ${input.status}`;
  const maxLineWidth = UI_WIDTH + INDENT.length;
  const maxDetailWidth = Math.max(0, maxLineWidth - visibleLength(plainPrefix) - 3);
  const detail = input.detail && maxDetailWidth > 0
    ? ui.muted(` - ${truncateVisible(input.detail, maxDetailWidth)}`)
    : '';
  return `${INDENT}${ui.muted(icon)} ${ui.strong(labelText)} ${status}${detail}`;
}

export function renderThinkingState(input: ThinkingStateInput): string {
  const statusText = input.status === 'reasoning'
    ? ui.accent(input.status)
    : input.status === 'waiting'
      ? ui.warning(input.status)
      : ui.muted(input.status);
  const meta = [
    input.model ? `model ${truncateVisible(input.model, 12)}` : '',
    input.mode ? `mode ${input.mode}` : '',
  ].filter(Boolean).join(` ${glyphs.separator} `);
  const prefix = `${INDENT}${glyphs.diamondOpen} ${input.label} ${input.status}${meta ? ` ${meta}` : ''}`;
  const maxLineWidth = UI_WIDTH + INDENT.length;
  const maxDetailWidth = Math.max(0, maxLineWidth - visibleLength(prefix) - 3);
  const detail = input.detail && maxDetailWidth > 0
    ? ui.muted(` - ${truncateVisibleEnd(input.detail, maxDetailWidth)}`)
    : '';
  const metaText = meta ? ui.muted(` ${meta}`) : '';
  return `${INDENT}${ui.muted(glyphs.diamondOpen)} ${ui.strong(truncateVisible(input.label, 14))} ${statusText}${metaText}${detail}`;
}

export function renderAgentProgressEvent(input: AgentProgressEventInput): string {
  const { event } = input;
  if (event.type === 'turn_start') {
    return renderThinkingState({
      label: 'Agent',
      status: 'thinking',
      model: input.model,
      mode: input.mode,
      detail: `round ${event.round || 1} with ${event.messageCount || 0} messages`,
    });
  }
  if (event.type === 'assistant_message') {
    return renderThinkingState({
      label: 'Agent',
      status: event.toolCallCount ? 'reasoning' : 'responding',
      model: input.model,
      mode: input.mode,
      detail: event.toolCallCount ? `${event.toolCallCount} tool calls requested` : 'drafting final response',
    });
  }
  if (event.type === 'tool_start') {
    return renderTimelineEntry({
      kind: 'tool',
      status: 'running',
      label: event.toolName || 'tool',
      detail: `round ${event.round || 1}`,
    });
  }
  if (event.type === 'tool_result') {
    return renderTimelineEntry({
      kind: 'tool',
      status: event.permissionDecision === 'deny' ? 'failed' : 'completed',
      label: event.toolName || 'tool',
      detail: [event.permissionDecision || '', event.contentPreview || ''].filter(Boolean).join(' '),
    });
  }
  if (event.type === 'permission_required') {
    return renderThinkingState({
      label: 'Agent',
      status: 'waiting',
      model: input.model,
      mode: input.mode,
      detail: `${event.toolName || 'tool'} permission required`,
    });
  }
  if (event.type === 'plan_approval_required') {
    return renderThinkingState({
      label: 'Plan',
      status: 'waiting',
      model: input.model,
      mode: input.mode,
      detail: `${event.permissionCount || 0} permissions requested`,
    });
  }
  if (event.type === 'turn_complete') {
    return renderThinkingState({
      label: 'Agent',
      status: 'responding',
      model: input.model,
      mode: input.mode,
      detail: `${event.toolResultCount || 0} tool results ready`,
    });
  }
  return renderThinkingState({
    label: 'Agent',
    status: 'thinking',
    model: input.model,
    mode: input.mode,
    detail: event.type,
  });
}

function formatSubagentTimelineDetail(input: SubagentTimelineInput): string {
  if (input.status === 'failed') {
    return input.error || input.prompt;
  }
  if (input.status === 'cancelled') {
    return formatSubagentMetrics(input.summary || input.prompt, input);
  }
  if (input.summary) {
    return formatSubagentMetrics(input.summary, input);
  }
  return input.prompt;
}

function formatSubagentMetrics(summary: string, input: SubagentTimelineInput): string {
  const parts = [summary];
  if (input.toolCount != null) parts.push(`tools=${input.toolCount}`);
  if (input.permissionCount != null) parts.push(`permissions=${input.permissionCount}`);
  if (input.elapsedMs != null) parts.push(`${input.elapsedMs}ms`);
  return parts.join(` ${glyphs.separator} `);
}

export function renderSubagentTimelineEntry(input: SubagentTimelineInput): string {
  return renderTimelineEntry({
    kind: 'subagent',
    status: input.status,
    label: input.id,
    detail: formatSubagentTimelineDetail(input),
  });
}

export function renderRecentDenials(input: RecentDenialsInput): string {
  if (!input.denials.length) return '';
  const header = `${INDENT}${ui.warning('Recent Denials')}`;
  const items = input.denials.slice(-5).map((d) => {
    const label = truncateVisible(`${d.toolName}: ${d.reason}`, 56);
    return `${INDENT}${ui.danger(glyphs.bullet)} ${ui.muted(label)}`;
  });
  return ['', header, `${INDENT}${panelDivider()}`, ...items].join('\n');
}

export function renderFileChangePreview(input: FileChangePreviewInput): string {
  const opLabels: Record<FileChangeOperation, string> = {
    create: 'Create file',
    overwrite: 'Overwrite file',
    edit: 'Edit file',
  };
  const opColors: Record<FileChangeOperation, (s: string) => string> = {
    create: ui.success,
    overwrite: ui.warning,
    edit: ui.accent,
  };
  const opLabel = opColors[input.operation](opLabels[input.operation]);

  const stats: string[] = [];
  if (input.added > 0) stats.push(ui.success(`+${input.added}`));
  if (input.removed > 0) stats.push(ui.danger(`-${input.removed}`));
  if (input.changed > 0) stats.push(ui.warning(`~${input.changed}`));
  const statsLine = stats.length ? stats.join(' ') : ui.muted('no changes');

  return [
    '',
    `${INDENT}${ui.warning('Permission')} ${opLabel}`,
    `${INDENT}${panelDivider()}`,
    ...renderPanelBody([
      `tool   ${ui.strong(truncateVisible(input.tool, 40))}`,
      `file   ${ui.muted(truncateVisible(input.filePath, 56))}`,
      `lines  ${statsLine}`,
    ]),
    `${INDENT}${renderByline([ui.success('[允许]'), ui.danger('[拒绝]'), ui.muted('[本次会话记住]')])}`,
    `${INDENT}${renderInputGuide([
      { shortcut: 'Enter', action: 'allow once', bold: true },
      { shortcut: 'Esc', action: 'reject' },
    ])}`,
  ].join('\n');
}

export function renderKeyboardHintRow(): string {
  const hints = [
    `${ui.muted('Esc')} dismiss`,
    `${ui.muted('Tab')} complete`,
    `${ui.muted('Enter')} send`,
    `${ui.muted('↑/↓')} navigate`,
  ];
  return `${INDENT}${truncateVisible(hints.join(ui.muted(` ${glyphs.separator} `)), UI_WIDTH)}`;
}
