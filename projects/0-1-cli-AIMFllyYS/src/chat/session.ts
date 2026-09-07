import type { SubagentQueue } from './agent/types';
import { getCurrentPlanPath, readCurrentPlanFile, writeCurrentPlanFile } from './plan-store';

export type AiMode = 'chat' | 'agent' | 'plan';
export type PermissionMode = 'ask' | 'bypass' | 'plan';

export interface SessionOptions {
  modelId: string;
  autoAccept?: boolean;
}

export interface AiSessionState {
  mode: AiMode;
  permissionMode: PermissionMode;
  currentModelId: string;
  autoAccept: boolean;
  inSubmenu: boolean;
  activeSkillIds: string[];
  currentPlan?: string;
  currentPlanPath?: string;
  subagents?: SubagentQueue;
}

export function createSessionState(options: SessionOptions): AiSessionState {
  return {
    mode: options.autoAccept ? 'agent' : 'chat',
    permissionMode: options.autoAccept ? 'bypass' : 'ask',
    currentModelId: options.modelId,
    autoAccept: Boolean(options.autoAccept),
    inSubmenu: false,
    activeSkillIds: [],
  };
}

export function setMode(state: AiSessionState, mode: AiMode): AiSessionState {
  state.mode = mode;
  if (mode === 'plan') {
    state.permissionMode = 'plan';
  } else if (mode === 'agent' && state.autoAccept) {
    state.permissionMode = 'bypass';
  } else {
    state.permissionMode = 'ask';
  }
  return state;
}

export function setCurrentModel(state: AiSessionState, modelId: string): AiSessionState {
  state.currentModelId = modelId;
  return state;
}

export function recordCurrentPlan(state: AiSessionState, content: string, options: { workspaceRoot?: string } = {}): AiSessionState {
  const trimmed = content.trim();
  if (trimmed) {
    state.currentPlan = trimmed;
    if (options.workspaceRoot) {
      state.currentPlanPath = writeCurrentPlanFile(options.workspaceRoot, trimmed);
    }
  }
  return state;
}

export function loadCurrentPlanFromWorkspace(state: AiSessionState, workspaceRoot: string): AiSessionState {
  const currentPlan = readCurrentPlanFile(workspaceRoot);
  if (currentPlan) {
    state.currentPlan = currentPlan;
    state.currentPlanPath = getCurrentPlanPath(workspaceRoot);
  }
  return state;
}

export function formatCurrentPlan(state: Pick<AiSessionState, 'currentPlan' | 'currentPlanPath'>): string {
  const plan = state.currentPlan?.trim();
  if (!plan) return 'No current plan yet. Use /plan <task> to draft one.';
  return state.currentPlanPath ? `Plan file: ${state.currentPlanPath}\n\n${plan}` : plan;
}

export function describeMode(state: AiSessionState): string {
  return `${state.mode} / ${state.permissionMode}`;
}
