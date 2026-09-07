import { AiMode, AiSessionState, PermissionMode } from './session';
import { ensurePlanDraftPath, readCurrentPlanFile } from './plan-store';

export interface ModeCommand {
  mode: AiMode;
}

export interface ModeCommandAction extends ModeCommand {
  nextInput?: string;
}

export interface ModeConfig {
  title: string;
  shortTitle: string;
  symbol: string;
  color: 'text' | 'permission' | 'plan' | 'danger';
  hint: string;
}

export const MODE_CONFIG: Record<AiMode, ModeConfig> = {
  chat: {
    title: 'Chat Mode',
    shortTitle: 'Chat',
    symbol: 'C',
    color: 'text',
    hint: 'read-only',
  },
  agent: {
    title: 'Agent Mode',
    shortTitle: 'Agent',
    symbol: 'A',
    color: 'permission',
    hint: 'asks before tools',
  },
  plan: {
    title: 'Plan Mode',
    shortTitle: 'Plan',
    symbol: 'P',
    color: 'plan',
    hint: 'no edits',
  },
};

export function resolveModeCommand(input: string): ModeCommand | null {
  const command = input.trim().split(/\s+/)[0].toLowerCase();
  if (command === '/chat') return { mode: 'chat' };
  if (command === '/agent') return { mode: 'agent' };
  if (command === '/plan') return { mode: 'plan' };
  return null;
}

export function resolveModeCommandAction(command: string, args = ''): ModeCommandAction | null {
  const modeCommand = resolveModeCommand(command);
  if (!modeCommand) return null;

  const nextInput = modeCommand.mode === 'plan' ? args.trim() : '';
  return nextInput ? { ...modeCommand, nextInput } : modeCommand;
}

export function getModeConfig(mode: AiMode): ModeConfig {
  return MODE_CONFIG[mode];
}

export function preparePlanModeSession(state: AiSessionState, workspaceRoot: string): AiSessionState {
  state.currentPlanPath = ensurePlanDraftPath(workspaceRoot);
  const existingPlan = readCurrentPlanFile(workspaceRoot);
  if (existingPlan) state.currentPlan = existingPlan;
  return state;
}

export function resolvePlanApprovalOutcome(
  approved: boolean,
  options: Pick<AiSessionState, 'autoAccept'>,
): { mode: AiMode; permissionMode: PermissionMode } {
  if (approved) {
    return {
      mode: 'agent',
      permissionMode: options.autoAccept ? 'bypass' : 'ask',
    };
  }
  return { mode: 'plan', permissionMode: 'plan' };
}

export function getNextMode(state: Pick<AiSessionState, 'mode' | 'autoAccept'>): AiMode {
  if (state.autoAccept) {
    if (state.mode === 'agent') return 'chat';
    if (state.mode === 'chat') return 'plan';
    return 'agent';
  }
  if (state.mode === 'chat') return 'agent';
  if (state.mode === 'agent') return 'plan';
  return 'chat';
}
