import { ChatMessage, ToolCall } from '../../types';
import { PermissionDecision, SessionPermissionMemory } from '../permissions/engine';
import { resolvePlanForApproval } from '../plan-store';
import { AiMode, PermissionMode } from '../session';
import { executeToolCall, ExecuteToolCallResult, parseToolCallArguments } from '../tools/runner';

export interface RunAgentTurnInput {
  messages: ChatMessage[];
  workspaceRoot: string;
  mode: AiMode;
  permissionMode: PermissionMode;
  session?: SessionPermissionMemory;
  maxToolRounds?: number;
  abortSignal?: AbortSignal;
  complete: (messages: ChatMessage[]) => Promise<ChatMessage> | ChatMessage;
  handleAgentTool?: (toolCall: ToolCall) => Promise<ChatMessage> | ChatMessage;
  onEvent?: AgentEventEmitter;
}

export interface AgentToolResult {
  toolCall: ToolCall;
  message: ChatMessage;
  permission: PermissionDecision;
}

export interface PlanPermissionRequest {
  action: string;
  reason?: string;
}

export type AgentTurnEvent =
  | {
      type: 'turn_start';
      round: number;
      messageCount: number;
    }
  | {
      type: 'assistant_message';
      round: number;
      content: string;
      toolCallCount: number;
    }
  | {
      type: 'tool_start';
      round: number;
      toolCallId: string;
      toolName: string;
    }
  | {
      type: 'tool_result';
      round: number;
      toolCallId: string;
      toolName: string;
      permissionDecision: PermissionDecision['decision'];
      contentPreview: string;
    }
  | {
      type: 'permission_required';
      round: number;
      toolCallId: string;
      toolName: string;
      reason: string;
    }
  | {
      type: 'plan_approval_required';
      round: number;
      toolCallId: string;
      planPreview: string;
      permissionCount: number;
    }
  | {
      type: 'turn_complete';
      status: 'completed' | 'max_tool_rounds';
      toolResultCount: number;
    };

export type RunAgentTurnResult =
  | {
      status: 'completed';
      finalMessage: ChatMessage;
      toolResults: AgentToolResult[];
    }
  | {
      status: 'permission_required';
      pendingToolCall: ToolCall;
      permission: PermissionDecision;
      assistantMessage: ChatMessage;
      toolMessage: ChatMessage;
      toolResults: AgentToolResult[];
    }
  | {
      status: 'plan_approval_required';
      pendingToolCall: ToolCall;
      assistantMessage: ChatMessage;
      plan: string;
      permissions: PlanPermissionRequest[];
      toolResults: AgentToolResult[];
    };

type AgentEventEmitter = (event: AgentTurnEvent) => void;

function parsePlanPermissions(value: unknown): PlanPermissionRequest[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      if (typeof item.action === 'string') {
        return {
          action: item.action,
          reason: typeof item.reason === 'string' ? item.reason : undefined,
        };
      }
      if (typeof item.tool === 'string' && typeof item.prompt === 'string') {
        return {
          action: `${item.tool}: ${item.prompt}`,
          reason: 'requested during plan approval',
        };
      }
      return { action: '', reason: undefined };
    })
    .filter((item) => item.action.trim());
}

function pushToolResult(
  input: RunAgentTurnInput,
  toolResults: AgentToolResult[],
  toolCall: ToolCall,
  message: ChatMessage,
  permission: PermissionDecision,
): void {
  input.messages.push(message);
  toolResults.push({ toolCall, message, permission });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Subagent cancelled');
  error.name = 'AbortError';
  throw error;
}

function emit(onEvent: AgentEventEmitter | undefined, event: AgentTurnEvent): void {
  onEvent?.(event);
}

function contentPreview(content: string): string {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length <= 160 ? compact : `${compact.slice(0, 157)}...`;
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const toolResults: AgentToolResult[] = [];
  const maxToolRounds = input.maxToolRounds ?? 8;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const eventRound = round + 1;
    throwIfAborted(input.abortSignal);
    emit(input.onEvent, { type: 'turn_start', round: eventRound, messageCount: input.messages.length });
    const assistantMessage = await input.complete(input.messages);
    throwIfAborted(input.abortSignal);
    input.messages.push(assistantMessage);

    const toolCalls = assistantMessage.tool_calls || [];
    emit(input.onEvent, {
      type: 'assistant_message',
      round: eventRound,
      content: assistantMessage.content || '',
      toolCallCount: toolCalls.length,
    });
    if (toolCalls.length === 0) {
      emit(input.onEvent, { type: 'turn_complete', status: 'completed', toolResultCount: toolResults.length });
      return { status: 'completed', finalMessage: assistantMessage, toolResults };
    }

    for (const toolCall of toolCalls) {
      throwIfAborted(input.abortSignal);
      emit(input.onEvent, {
        type: 'tool_start',
        round: eventRound,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
      });
      if (toolCall.function.name === 'exit_plan_mode') {
        if (input.mode !== 'plan') {
          pushToolResult(input, toolResults, toolCall, {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: 'You are not in plan mode. This tool is only for exiting plan mode after writing a plan.',
          }, { decision: 'deny', reason: 'exit_plan_mode outside plan mode' });
          emit(input.onEvent, {
            type: 'tool_result',
            round: eventRound,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            permissionDecision: 'deny',
            contentPreview: 'exit_plan_mode outside plan mode',
          });
          continue;
        }

        const parsed = parseToolCallArguments(toolCall);
        if (!parsed.ok) {
          pushToolResult(input, toolResults, toolCall, {
            role: 'tool',
            tool_call_id: toolCall.id,
            content: parsed.error,
          }, { decision: 'deny', reason: 'malformed tool arguments' });
          emit(input.onEvent, {
            type: 'tool_result',
            round: eventRound,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            permissionDecision: 'deny',
            contentPreview: contentPreview(parsed.error),
          });
          continue;
        }

        const args = parsed.args;
        const toolPlan = typeof args.plan === 'string' ? args.plan : undefined;
        const permissions = parsePlanPermissions(args.permissions ?? args.allowedPrompts);
        const plan = resolvePlanForApproval(input.workspaceRoot, toolPlan);
        emit(input.onEvent, {
          type: 'plan_approval_required',
          round: eventRound,
          toolCallId: toolCall.id,
          planPreview: contentPreview(plan),
          permissionCount: permissions.length,
        });
        return {
          status: 'plan_approval_required',
          pendingToolCall: toolCall,
          assistantMessage,
          plan,
          permissions,
          toolResults,
        };
      }

      if (toolCall.function.name === 'task' && input.mode === 'agent' && input.handleAgentTool) {
        const message = await input.handleAgentTool(toolCall);
        pushToolResult(input, toolResults, toolCall, message, { decision: 'allow', reason: 'agent task delegation' });
        emit(input.onEvent, {
          type: 'tool_result',
          round: eventRound,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          permissionDecision: 'allow',
          contentPreview: contentPreview(message.content),
        });
        continue;
      }

      const result: ExecuteToolCallResult = await executeToolCall({
        toolCall,
        mode: input.mode,
        permissionMode: input.permissionMode,
        workspaceRoot: input.workspaceRoot,
        session: input.session,
      });

      if (result.permissionRequired) {
        emit(input.onEvent, {
          type: 'permission_required',
          round: eventRound,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
          reason: result.permission.reason || 'permission required',
        });
        return {
          status: 'permission_required',
          pendingToolCall: toolCall,
          permission: result.permission,
          assistantMessage,
          toolMessage: result.message,
          toolResults,
        };
      }

      pushToolResult(input, toolResults, toolCall, result.message, result.permission);
      emit(input.onEvent, {
        type: 'tool_result',
        round: eventRound,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        permissionDecision: result.permission.decision,
        contentPreview: contentPreview(result.message.content),
      });
    }
  }

  const finalMessage: ChatMessage = {
    role: 'assistant',
    content: `Stopped after ${maxToolRounds} tool rounds to avoid an infinite agent loop.`,
  };
  input.messages.push(finalMessage);
  emit(input.onEvent, { type: 'turn_complete', status: 'max_tool_rounds', toolResultCount: toolResults.length });
  return { status: 'completed', finalMessage, toolResults };
}
