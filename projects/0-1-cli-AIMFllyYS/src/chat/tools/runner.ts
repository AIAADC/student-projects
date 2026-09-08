import { ChatMessage, ToolCall } from '../../types';
import { AiMode, PermissionMode } from '../session';
import { decidePermission, PermissionDecision, SessionPermissionMemory } from '../permissions/engine';
import { listFilesTool, readFileTool, searchFilesTool } from './fs-read';
import { computeFileChangeSummary, FileChangeSummary, writeFileTool } from './fs-write';
import { runShellTool } from './shell';
import { formatToolInputError, getToolDefinition, isKnownTool } from './registry';

export interface ExecuteToolCallInput {
  toolCall: ToolCall;
  mode: AiMode;
  permissionMode: PermissionMode;
  workspaceRoot: string;
  session?: SessionPermissionMemory;
  forcePermissionDecision?: PermissionDecision;
}

export interface ExecuteToolCallResult {
  message: ChatMessage;
  permission: PermissionDecision;
  permissionRequired: boolean;
  fileChangeSummary?: FileChangeSummary;
}

export type ParsedToolArguments =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string };

function toolMessage(toolCall: ToolCall, content: string): ChatMessage {
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content,
  };
}

export function parseToolCallArguments(toolCall: ToolCall): ParsedToolArguments {
  const raw = toolCall.function.arguments ?? '';
  if (!raw.trim()) {
    return { ok: true, args: {} };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        error: formatToolInputError(toolCall.function.name, 'arguments must be a JSON object'),
      };
    }
    return { ok: true, args: parsed as Record<string, unknown> };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'invalid JSON';
    return {
      ok: false,
      error: formatToolInputError(toolCall.function.name, `malformed JSON arguments: ${detail}`),
    };
  }
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

async function runAllowedTool(name: string, args: Record<string, unknown>, workspaceRoot: string, permission: PermissionDecision): Promise<string> {
  if (name === 'list_files') {
    return listFilesTool({ path: asString(args.path, '.'), workspaceRoot });
  }
  if (name === 'read_file') {
    return readFileTool({ path: asString(args.path), workspaceRoot });
  }
  if (name === 'search_files') {
    return searchFilesTool({
      pattern: asString(args.pattern),
      path: asString(args.path, '.'),
      workspaceRoot,
    });
  }
  if (name === 'write_file') {
    return writeFileTool({
      path: asString(args.path),
      content: asString(args.content),
      workspaceRoot,
      permissionDecision: permission,
    });
  }
  if (name === 'shell') {
    return runShellTool({
      command: asString(args.command),
      args: asStringArray(args.args),
      cwd: asString(args.cwd, '.'),
      workspaceRoot,
      permissionDecision: permission,
    });
  }
  return `Error: unsupported tool ${name}`;
}

export async function executeToolCall(input: ExecuteToolCallInput): Promise<ExecuteToolCallResult> {
  const name = input.toolCall.function.name;
  const parsedArgs = parseToolCallArguments(input.toolCall);

  if (!parsedArgs.ok) {
    return {
      permission: { decision: 'deny', reason: 'malformed tool arguments' },
      permissionRequired: false,
      message: toolMessage(input.toolCall, parsedArgs.error),
    };
  }

  if (!isKnownTool(name)) {
    return {
      permission: { decision: 'deny', reason: 'unknown tool' },
      permissionRequired: false,
      message: toolMessage(input.toolCall, `Tool denied: unknown tool ${name}`),
    };
  }

  const args = parsedArgs.args;
  let permission: PermissionDecision;
  try {
    const tool = getToolDefinition(name);
    permission = decidePermission({
      mode: input.mode,
      permissionMode: input.permissionMode,
      tool,
      input: args,
      workspaceRoot: input.workspaceRoot,
      session: input.session,
    });
    if (input.forcePermissionDecision?.decision === 'allow' && permission.decision === 'ask') {
      permission = input.forcePermissionDecision;
    } else if (input.forcePermissionDecision?.decision === 'deny') {
      permission = input.forcePermissionDecision;
    }
  } catch {
    permission = { decision: 'deny', reason: 'unknown tool' };
  }

  if (permission.decision === 'ask') {
    let fileChangeSummary: FileChangeSummary | undefined;
    if (name === 'write_file') {
      try {
        fileChangeSummary = computeFileChangeSummary({
          targetPath: asString(args.path),
          newContent: asString(args.content),
          workspaceRoot: input.workspaceRoot,
        });
      } catch { /* non-critical: preview unavailable */ }
    }
    return {
      permission,
      permissionRequired: true,
      fileChangeSummary,
      message: toolMessage(input.toolCall, `Permission required for ${name}: ${permission.reason}`),
    };
  }

  if (permission.decision === 'deny') {
    return {
      permission,
      permissionRequired: false,
      message: toolMessage(input.toolCall, `Tool denied: ${permission.reason}`),
    };
  }

  const content = await runAllowedTool(name, args, input.workspaceRoot, permission);
  return {
    permission,
    permissionRequired: false,
    message: toolMessage(input.toolCall, content),
  };
}
