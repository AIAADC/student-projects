import { ChatMessage } from '../../types';
import { getModelById, MODELS } from '../models';
import { SessionPermissionMemory } from '../permissions/engine';
import { chatCompleteMessage } from '../provider';
import { buildProviderToolSpecs, ProviderToolSpec } from '../tools/registry';
import { runAgentTurn } from './loop';
import { buildSubagentMessages } from './prompt';
import { runNextSubagent } from './subagents';
import { SubagentQueue, SubagentResult, SubagentTask } from './types';

export interface SubagentRunner {
  runNext(queue: SubagentQueue): Promise<SubagentTask>;
}

export type AiSubagentComplete = (
  messages: ChatMessage[],
  task: SubagentTask,
  tools: ProviderToolSpec[]
) => Promise<ChatMessage> | ChatMessage;

export interface AiSubagentHandlerOptions {
  workspaceRoot: string;
  complete?: AiSubagentComplete;
  session?: SessionPermissionMemory;
  maxToolRounds?: number;
}

export function createLocalSubagentRunner(handler?: (task: SubagentTask) => Promise<SubagentResult> | SubagentResult): SubagentRunner {
  return {
    runNext: (queue) => runNextSubagent(queue, handler),
  };
}

function buildScopedToolSpecs(task: SubagentTask): ProviderToolSpec[] {
  let tools = buildProviderToolSpecs(task.mode);
  if (task.allowedTools.length && !task.allowedTools.includes('*')) {
    const allowed = new Set(task.allowedTools);
    tools = tools.filter((tool) => allowed.has(tool.function.name));
  }
  const disallowedTools = task.disallowedTools || [];
  if (disallowedTools.length) {
    const disallowed = new Set(disallowedTools);
    tools = tools.filter((tool) => !disallowed.has(tool.function.name));
  }
  return tools;
}

function defaultAiComplete(tools: ProviderToolSpec[]): AiSubagentComplete {
  return (messages, task) => {
    const model = getModelById(task.modelId || '') || MODELS[0];
    return chatCompleteMessage(messages, model, tools);
  };
}

function countPermissionPrompts(toolResults: Array<{ permission: { decision: string } }>): number {
  return toolResults.filter((entry) => entry.permission.decision === 'ask').length;
}

export function createAiSubagentHandler(options: AiSubagentHandlerOptions): (
  task: SubagentTask,
  context?: { signal?: AbortSignal }
) => Promise<SubagentResult> {
  return async (task, context) => {
    const startedAt = Date.now();
    const messages = buildSubagentMessages(task);
    const tools = buildScopedToolSpecs(task);
    const complete = options.complete || defaultAiComplete(tools);
    const result = await runAgentTurn({
      messages,
      workspaceRoot: options.workspaceRoot,
      mode: task.mode,
      permissionMode: task.permissionMode,
      session: options.session,
      maxToolRounds: options.maxToolRounds,
      abortSignal: context?.signal,
      complete: (nextMessages) => complete(nextMessages, task, tools),
    });
    const elapsedMs = Date.now() - startedAt;

    if (result.status === 'permission_required') {
      return {
        summary: `Permission required for ${result.pendingToolCall.function.name}`,
        notes: [
          `permission=${result.permission.decision}`,
          `reason=${result.permission.reason}`,
          `toolResults=${result.toolResults.length}`,
        ],
        toolCount: result.toolResults.length,
        permissionCount: countPermissionPrompts(result.toolResults) + 1,
        elapsedMs,
      };
    }

    if (result.status === 'plan_approval_required') {
      return {
        summary: 'Plan approval required',
        notes: [
          `plan=${result.plan}`,
          `permissions=${result.permissions.map((permission) => permission.action).join(',') || 'none'}`,
          `toolResults=${result.toolResults.length}`,
        ],
        toolCount: result.toolResults.length,
        permissionCount: countPermissionPrompts(result.toolResults) + result.permissions.length,
        elapsedMs,
      };
    }

    return {
      summary: result.finalMessage.content || 'Subagent completed.',
      notes: [
        `mode=${task.mode}`,
        `permissionMode=${task.permissionMode}`,
        `toolResults=${result.toolResults.length}`,
      ],
      toolCount: result.toolResults.length,
      permissionCount: countPermissionPrompts(result.toolResults),
      elapsedMs,
    };
  };
}
