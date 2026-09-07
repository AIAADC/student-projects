import { PermissionDecision, recordDenial, rememberSessionPermissionRule, resolveWorkspacePath, SessionPermissionMemory, SessionPermissionRule } from './engine';
import { RunAgentTurnInput, RunAgentTurnResult, runAgentTurn } from '../agent/loop';
import { executeToolCall } from '../tools/runner';
import { renderFileChangePreview, renderPermissionBox, renderRecentDenials } from '../ui/layout';
import { getRecentDenials } from './engine';
import type { FileChangeOperation } from '../tools/fs-write';
import { classifyShellCommand, getDestructiveCommandWarning } from '../tools/shell';

export interface FilePermissionBoxInput {
  tool: string;
  filePath: string;
  operation: FileChangeOperation;
  added: number;
  removed: number;
  changed: number;
}

export type PermissionPromptChoice =
  | { kind: 'allow_once' }
  | { kind: 'deny' }
  | { kind: 'deny_feedback'; feedback?: string }
  | { kind: 'cancel' }
  | { kind: 'allow_session' }
  | { kind: 'invalid' };

export type PermissionPromptResult =
  | RunAgentTurnResult
  | {
      status: 'denied';
      toolMessage: { role: 'tool'; tool_call_id?: string; content: string };
    }
  | {
      status: 'cancelled';
      reason: string;
    };

export function formatPermissionDecision(decision: PermissionDecision, tool = 'tool'): string {
  return renderPermissionBox({ tool, action: decision.decision, reason: decision.reason });
}

export function formatFilePermissionBox(input: FilePermissionBoxInput): string {
  return renderFileChangePreview({
    tool: input.tool,
    filePath: input.filePath,
    operation: input.operation,
    added: input.added,
    removed: input.removed,
    changed: input.changed,
  });
}

export function parsePermissionPromptChoice(input: string): PermissionPromptChoice {
  const normalized = input.trim().toLowerCase();
  if (normalized === '1' || normalized === 'y' || normalized === 'yes' || normalized === 'allow') {
    return { kind: 'allow_once' };
  }
  if (normalized === '2' || normalized === 'session' || normalized === 'always' || normalized === 'allow session') {
    return { kind: 'allow_session' };
  }
  if (normalized === '3' || normalized === 'n' || normalized === 'no' || normalized === 'deny') {
    return { kind: 'deny' };
  }
  if (normalized === '4' || normalized === 'feedback' || normalized === 'deny feedback' || normalized === 'deny with feedback') {
    return { kind: 'deny_feedback' };
  }
  if (normalized === '5' || normalized === 'cancel' || normalized === 'esc') {
    return { kind: 'cancel' };
  }
  return { kind: 'invalid' };
}

export function formatPermissionPromptOptions(): string {
  return [
    '  1) Allow once',
    '  2) Allow matching operation for this session',
    '  3) Deny',
    '  4) Deny with feedback',
    '  5) Cancel',
  ].join('\n');
}

export function formatRecentDenials(session?: SessionPermissionMemory): string {
  const denials = getRecentDenials(session);
  return renderRecentDenials({ denials });
}

export function formatShellPermissionPrompt(input: { command: string; args?: string[] }): string {
  const args = input.args || [];
  const classification = classifyShellCommand(input.command, args);
  const commandLine = [input.command, ...args].join(' ');
  const lines: string[] = [];
  lines.push(`  Shell: ${commandLine}`);
  if (classification.warning) {
    lines.push(`  ⚠ ${classification.warning}`);
  }
  if (classification.level === 'catastrophic') {
    lines.push('  ✖ This command is blocked and cannot be approved.');
  }
  return lines.join('\n');
}

function parseToolArguments(toolCall: Extract<RunAgentTurnResult, { status: 'permission_required' }>['pendingToolCall']): Record<string, unknown> {
  try {
    const parsed = JSON.parse(toolCall.function.arguments || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function sessionRuleForToolCall(input: {
  pending: Extract<RunAgentTurnResult, { status: 'permission_required' }>;
  workspaceRoot: string;
}): SessionPermissionRule | null {
  const toolName = input.pending.pendingToolCall.function.name;
  const args = parseToolArguments(input.pending.pendingToolCall);
  if (typeof args.path === 'string' && args.path.trim()) {
    return {
      toolName,
      pathPrefix: resolveWorkspacePath(input.workspaceRoot, args.path),
    };
  }
  if (typeof args.command === 'string' && args.command.trim()) {
    return {
      toolName,
      commandPrefix: args.command.trim().split(/\s+/).slice(0, 2).join(' '),
    };
  }
  return null;
}

export async function applyPermissionPromptChoice(input: {
  choice: PermissionPromptChoice;
  pending: Extract<RunAgentTurnResult, { status: 'permission_required' }>;
  messages: RunAgentTurnInput['messages'];
  workspaceRoot: string;
  mode: RunAgentTurnInput['mode'];
  permissionMode: RunAgentTurnInput['permissionMode'];
  session?: SessionPermissionMemory;
  complete: RunAgentTurnInput['complete'];
  handleAgentTool?: RunAgentTurnInput['handleAgentTool'];
  maxToolRounds?: number;
}): Promise<PermissionPromptResult> {
  const toolName = input.pending.pendingToolCall.function.name;

  if (input.choice.kind === 'cancel') {
    return {
      status: 'cancelled',
      reason: `Permission request cancelled for ${toolName}`,
    };
  }

  if (input.choice.kind === 'deny_feedback') {
    const feedback = input.choice.feedback?.trim() || 'No additional feedback provided.';
    const toolMessage = {
      role: 'tool' as const,
      tool_call_id: input.pending.pendingToolCall.id,
      content: `Tool denied by user: ${toolName}. Feedback: ${feedback}`,
    };
    if (input.session) {
      recordDenial(input.session, { toolName, reason: `denied with feedback: ${feedback}`, input: parseToolArguments(input.pending.pendingToolCall) });
    }
    input.messages.push(toolMessage);
    return runAgentTurn({
      messages: input.messages,
      workspaceRoot: input.workspaceRoot,
      mode: input.mode,
      permissionMode: input.permissionMode,
      session: input.session,
      maxToolRounds: input.maxToolRounds,
      complete: input.complete,
      handleAgentTool: input.handleAgentTool,
    });
  }

  if (input.choice.kind === 'deny' || input.choice.kind === 'invalid') {
    const toolMessage = {
      role: 'tool' as const,
      tool_call_id: input.pending.pendingToolCall.id,
      content: `Tool denied by user: ${toolName}`,
    };
    if (input.session) {
      recordDenial(input.session, { toolName, reason: 'denied by user', input: parseToolArguments(input.pending.pendingToolCall) });
    }
    input.messages.push(toolMessage);
    return { status: 'denied', toolMessage };
  }

  let session = input.session;
  if (input.choice.kind === 'allow_session') {
    session ||= {};
    const rule = sessionRuleForToolCall({ pending: input.pending, workspaceRoot: input.workspaceRoot });
    if (rule) rememberSessionPermissionRule(session, rule);
  }

  const toolResult = await executeToolCall({
    toolCall: input.pending.pendingToolCall,
    mode: input.mode,
    permissionMode: input.permissionMode,
    workspaceRoot: input.workspaceRoot,
    session,
    forcePermissionDecision: input.choice.kind === 'allow_once'
      ? { decision: 'allow', reason: 'user allowed once' }
      : undefined,
  });

  input.messages.push(toolResult.message);

  return runAgentTurn({
    messages: input.messages,
    workspaceRoot: input.workspaceRoot,
    mode: input.mode,
    permissionMode: input.permissionMode,
    session,
    maxToolRounds: input.maxToolRounds,
    complete: input.complete,
    handleAgentTool: input.handleAgentTool,
  });
}
