import { PermissionMode } from '../session';
import { SubagentQueue, SubagentResult, SubagentTask, SubagentTaskInput } from './types';

export type AgentCommand =
  | { kind: 'mode' }
  | { kind: 'list' }
  | { kind: 'spawn'; prompt: string }
  | { kind: 'cancel'; id: string }
  | { kind: 'unknown'; value: string };

export type SubagentHandlerContext = {
  signal?: AbortSignal;
};

export type SubagentHandler = (
  task: SubagentTask,
  context?: SubagentHandlerContext
) => Promise<SubagentResult> | SubagentResult;

export interface SubagentTimelineInput {
  id: string;
  status: SubagentTask['status'];
  prompt: string;
  summary?: string;
  toolCount?: number;
  permissionCount?: number;
  elapsedMs?: number;
  error?: string;
}

export const DEFAULT_SUBAGENT_CONCURRENCY = 1;

const PERMISSION_RANK: Record<PermissionMode, number> = {
  plan: 0,
  ask: 1,
  bypass: 2,
};

export function narrowPermission(parent: PermissionMode, requested?: PermissionMode): PermissionMode {
  if (!requested) return parent === 'bypass' ? 'ask' : parent;
  return PERMISSION_RANK[requested] <= PERMISSION_RANK[parent] ? requested : parent;
}

export function createSubagentQueue(options: {
  parentPermissionMode: PermissionMode;
  concurrency?: number;
}): SubagentQueue {
  return {
    parentPermissionMode: options.parentPermissionMode,
    nextId: 1,
    items: [],
    concurrency: options.concurrency ?? DEFAULT_SUBAGENT_CONCURRENCY,
  };
}

export function setSubagentParentPermission(queue: SubagentQueue, permissionMode: PermissionMode): void {
  queue.parentPermissionMode = permissionMode;
}

export function countRunningSubagents(queue: SubagentQueue): number {
  return queue.items.filter((item) => item.status === 'running').length;
}

export function enqueueSubagent(queue: SubagentQueue, input: SubagentTaskInput): SubagentTask {
  const task: SubagentTask = {
    id: `sub-${queue.nextId++}`,
    status: 'queued',
    prompt: input.prompt,
    mode: input.mode || 'agent',
    permissionMode: narrowPermission(queue.parentPermissionMode, input.permissionMode),
    allowedTools: input.allowedTools || [],
    disallowedTools: input.disallowedTools || [],
    skillIds: input.skillIds || [],
    modelId: input.modelId,
    currentPlan: input.currentPlan,
    currentPlanPath: input.currentPlanPath,
    agentType: input.agentType,
    agentSystemPrompt: input.agentSystemPrompt,
    parentRecentMessages: input.parentRecentMessages || [],
    createdAt: Date.now(),
  };
  queue.items.push(task);
  return task;
}

function claimNextQueuedSubagent(queue: SubagentQueue): SubagentTask | undefined {
  const task = queue.items.find((item) => item.status === 'queued');
  if (!task) return undefined;
  task.status = 'running';
  task.startedAt = Date.now();
  return task;
}

export function cancelSubagent(
  queue: SubagentQueue,
  id: string,
  options?: { partialResult?: SubagentResult },
): SubagentTask {
  const task = queue.items.find((item) => item.id === id);
  if (!task) throw new Error(`Unknown subagent: ${id}`);
  if (task.status === 'completed' || task.status === 'failed') return task;

  task.cancelRequested = true;
  task.abortController?.abort();
  task.status = 'cancelled';
  task.completedAt = Date.now();

  if (options?.partialResult) {
    task.result = normalizeResult(options.partialResult, task);
  }

  return task;
}

export async function runNextSubagent(
  queue: SubagentQueue,
  handler: SubagentHandler = defaultSubagentHandler
): Promise<SubagentTask> {
  const task = claimNextQueuedSubagent(queue);
  if (!task) throw new Error('No queued subagents');

  const abortController = new AbortController();
  task.abortController = abortController;

  try {
    const result = await handler(task, { signal: abortController.signal });
    const current = queue.items.find((item) => item.id === task.id) || task;
    if (current.status === 'cancelled' || current.cancelRequested || abortController.signal.aborted) {
      current.status = 'cancelled';
      current.completedAt = Date.now();
      if (current.result) task.result = current.result;
      else if (result) task.result = normalizeResult(result, task);
      return current;
    }
    task.status = 'completed';
    task.result = normalizeResult(result, task);
    task.completedAt = Date.now();
    return task;
  } catch (error: any) {
    const current = queue.items.find((item) => item.id === task.id) || task;
    if (current.status === 'cancelled' || current.cancelRequested || error?.name === 'AbortError') {
      current.status = 'cancelled';
      current.completedAt = Date.now();
      if (current.result) task.result = current.result;
      return current;
    }
    task.status = 'failed';
    task.error = error?.message || String(error);
    task.completedAt = Date.now();
    return task;
  } finally {
    delete task.abortController;
  }
}

export async function runSubagentScheduler(
  queue: SubagentQueue,
  handler: SubagentHandler = defaultSubagentHandler,
  options?: { concurrency?: number },
): Promise<SubagentTask[]> {
  const concurrency = options?.concurrency ?? queue.concurrency ?? DEFAULT_SUBAGENT_CONCURRENCY;
  const completed: SubagentTask[] = [];
  const active = new Set<Promise<void>>();

  const startNext = (): void => {
    while (active.size < concurrency) {
      if (!queue.items.some((item) => item.status === 'queued')) break;
      const promise = runNextSubagent(queue, handler)
        .then((task) => {
          completed.push(task);
        })
        .finally(() => {
          active.delete(promise);
        });
      active.add(promise);
    }
  };

  startNext();

  while (active.size > 0 || queue.items.some((item) => item.status === 'queued')) {
    if (queue.items.some((item) => item.status === 'queued') && active.size < concurrency) {
      startNext();
    }
    if (active.size === 0) break;
    await Promise.race(active);
  }

  return completed;
}

export function formatSubagentActivityDetail(task: SubagentTask): string {
  if (task.status === 'failed') {
    return task.error || task.prompt;
  }
  if (task.status === 'cancelled') {
    return formatSubagentResultDetail(task.result?.summary || task.prompt, task.result);
  }
  if (task.result) {
    return formatSubagentResultDetail(task.result.summary, task.result);
  }
  return task.prompt;
}

export function buildSubagentTimelineInput(task: SubagentTask): SubagentTimelineInput {
  return {
    id: task.id,
    status: task.status,
    prompt: task.prompt,
    summary: task.result?.summary,
    toolCount: task.result?.toolCount,
    permissionCount: task.result?.permissionCount,
    elapsedMs: task.result?.elapsedMs ?? computeElapsedMs(task),
    error: task.error,
  };
}

export function formatSubagentList(queue: SubagentQueue): string {
  if (!queue.items.length) return 'No subagents.';
  return queue.items.map((task) => {
    const detail = task.result ? formatSubagentActivityDetail(task) : task.prompt;
    return `${task.id} [${task.status}] ${task.permissionMode}: ${detail}`;
  }).join('\n');
}

export function resolveAgentCommand(args: string): AgentCommand {
  const trimmed = args.trim();
  if (!trimmed) return { kind: 'mode' };
  const [command, ...rest] = trimmed.split(/\s+/);
  const normalized = command.toLowerCase();
  if (normalized === 'list' || normalized === 'ls') return { kind: 'list' };
  if (normalized === 'spawn') return { kind: 'spawn', prompt: rest.join(' ').trim() };
  if (normalized === 'cancel') return { kind: 'cancel', id: rest.join(' ').trim() };
  return { kind: 'unknown', value: trimmed };
}

function formatSubagentResultDetail(summary: string, result?: SubagentResult): string {
  const parts = [summary];
  if (result?.toolCount != null) parts.push(`tools=${result.toolCount}`);
  if (result?.permissionCount != null) parts.push(`permissions=${result.permissionCount}`);
  if (result?.elapsedMs != null) parts.push(`${result.elapsedMs}ms`);
  return parts.join(' · ');
}

function computeElapsedMs(task: SubagentTask): number | undefined {
  if (task.startedAt && task.completedAt) {
    return Math.max(0, task.completedAt - task.startedAt);
  }
  return undefined;
}

function normalizeResult(result: SubagentResult, task?: SubagentTask): SubagentResult {
  return {
    summary: result.summary || 'Subagent completed.',
    notes: result.notes || [],
    toolCount: result.toolCount,
    permissionCount: result.permissionCount,
    elapsedMs: result.elapsedMs ?? (task ? computeElapsedMs(task) : undefined),
  };
}

function defaultSubagentHandler(task: SubagentTask): SubagentResult {
  return {
    summary: `Queued local subagent task: ${task.prompt}`,
    notes: [
      `permissionMode=${task.permissionMode}`,
      task.modelId ? `modelId=${task.modelId}` : 'modelId=default',
      task.currentPlan ? `currentPlan=${task.currentPlan}` : 'currentPlan=none',
      task.currentPlanPath ? `currentPlanPath=${task.currentPlanPath}` : 'currentPlanPath=none',
      task.agentType ? `agentType=${task.agentType}` : 'agentType=general-purpose',
      task.skillIds.length ? `skillIds=${task.skillIds.join(',')}` : 'skillIds=none',
      task.allowedTools.length ? `allowedTools=${task.allowedTools.join(',')}` : 'allowedTools=none',
      task.disallowedTools.length ? `disallowedTools=${task.disallowedTools.join(',')}` : 'disallowedTools=none',
    ],
    toolCount: 0,
    permissionCount: 0,
    elapsedMs: 0,
  };
}

export type { SubagentQueue, SubagentResult, SubagentStatus, SubagentTask, SubagentTaskInput } from './types';
