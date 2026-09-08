import { ChatMessage } from '../../types';
import { AiMode, PermissionMode } from '../session';

export type SubagentStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubagentTaskInput {
  prompt: string;
  mode?: AiMode;
  permissionMode?: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
  skillIds?: string[];
  modelId?: string;
  currentPlan?: string;
  currentPlanPath?: string;
  agentType?: string;
  agentSystemPrompt?: string;
  parentRecentMessages?: ChatMessage[];
}

export interface SubagentResult {
  summary: string;
  notes: string[];
  toolCount?: number;
  permissionCount?: number;
  elapsedMs?: number;
}

export interface SubagentTask extends Required<Pick<SubagentTaskInput, 'prompt'>> {
  id: string;
  status: SubagentStatus;
  mode: AiMode;
  permissionMode: PermissionMode;
  allowedTools: string[];
  disallowedTools: string[];
  skillIds: string[];
  modelId?: string;
  currentPlan?: string;
  currentPlanPath?: string;
  agentType?: string;
  agentSystemPrompt?: string;
  parentRecentMessages: ChatMessage[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  cancelRequested?: boolean;
  abortController?: AbortController;
  result?: SubagentResult;
  error?: string;
}

export interface SubagentQueue {
  parentPermissionMode: PermissionMode;
  nextId: number;
  items: SubagentTask[];
  concurrency: number;
}
