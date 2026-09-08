import * as fs from 'fs';
import * as path from 'path';
import { AiMode, PermissionMode } from '../session';
import { getToolDefinition, ToolDefinition } from '../tools/registry';
import { classifyShellCommand } from '../tools/shell';

export type PermissionDecisionValue = 'allow' | 'ask' | 'deny';

export interface PermissionDecision {
  decision: PermissionDecisionValue;
  reason: string;
}

export interface RecentDenial {
  toolName: string;
  reason: string;
  timestamp: number;
  input?: Record<string, unknown>;
}

export interface SessionPermissionMemory {
  allowedTools?: Set<string>;
  deniedTools?: Set<string>;
  allowedRules?: SessionPermissionRule[];
  deniedRules?: SessionPermissionRule[];
  recentDenials?: RecentDenial[];
}

export interface SessionPermissionRule {
  toolName: string;
  pathPrefix?: string;
  commandPrefix?: string;
}

export interface PermissionRequest {
  mode: AiMode;
  permissionMode: PermissionMode;
  tool: Pick<ToolDefinition, 'name'> & Partial<Pick<ToolDefinition, 'kind' | 'allowedModes' | 'requiresPermission'>>;
  input?: { path?: string; [key: string]: unknown };
  workspaceRoot: string;
  session?: SessionPermissionMemory;
}

function comparePath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isInsidePath(root: string, target: string): boolean {
  const rootCmp = comparePath(root);
  const targetCmp = comparePath(target);
  return targetCmp === rootCmp || targetCmp.startsWith(rootCmp + path.sep);
}

function nearestExistingPath(targetPath: string): string | undefined {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return current;
}

export function resolveWorkspacePath(workspaceRoot: string, targetPath?: string): string {
  const root = path.resolve(workspaceRoot);
  if (!targetPath) return root;
  return path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(root, targetPath);
}

export function resolveExistingWorkspacePath(workspaceRoot: string, targetPath?: string): string | undefined {
  if (isDangerousPath(workspaceRoot, targetPath)) return undefined;
  try {
    return fs.realpathSync(resolveWorkspacePath(workspaceRoot, targetPath));
  } catch {
    return undefined;
  }
}

export function isDangerousPath(workspaceRoot: string, targetPath?: string): boolean {
  if (!targetPath) return false;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(path.resolve(workspaceRoot));
  } catch {
    return true;
  }

  const target = resolveWorkspacePath(workspaceRoot, targetPath);
  const existing = nearestExistingPath(target);
  if (!existing) return true;

  try {
    const realExisting = fs.realpathSync(existing);
    return !isInsidePath(realRoot, realExisting);
  } catch {
    return true;
  }
}

export function rememberSessionDecision(
  state: SessionPermissionMemory,
  decision: { toolName: string; decision: 'allow' | 'deny' }
): void {
  if (decision.decision === 'allow') {
    state.allowedTools ||= new Set<string>();
    state.allowedTools.add(decision.toolName);
    return;
  }
  state.deniedTools ||= new Set<string>();
  state.deniedTools.add(decision.toolName);
}

export function recordDenial(
  state: SessionPermissionMemory,
  denial: { toolName: string; reason: string; input?: Record<string, unknown> }
): void {
  state.recentDenials ||= [];
  state.recentDenials.push({
    toolName: denial.toolName,
    reason: denial.reason,
    timestamp: Date.now(),
    input: denial.input,
  });
}

export function getRecentDenials(state: SessionPermissionMemory | undefined, limit = 10): RecentDenial[] {
  if (!state?.recentDenials) return [];
  return state.recentDenials.slice(-limit);
}

export function rememberSessionPermissionRule(
  state: SessionPermissionMemory,
  rule: SessionPermissionRule & { decision?: 'allow' | 'deny' }
): void {
  const normalized: SessionPermissionRule = {
    toolName: rule.toolName,
    pathPrefix: rule.pathPrefix ? path.resolve(rule.pathPrefix) : undefined,
    commandPrefix: rule.commandPrefix,
  };
  if (rule.decision === 'deny') {
    state.deniedRules ||= [];
    state.deniedRules.push(normalized);
    return;
  }
  state.allowedRules ||= [];
  state.allowedRules.push(normalized);
}

function matchesSessionRule(request: PermissionRequest, rule: SessionPermissionRule): boolean {
  if (rule.toolName !== request.tool.name) return false;
  if (rule.pathPrefix) {
    const target = resolveWorkspacePath(request.workspaceRoot, request.input?.path);
    return isInsidePath(rule.pathPrefix, target);
  }
  if (rule.commandPrefix) {
    const command = typeof request.input?.command === 'string' ? request.input.command : '';
    return command.startsWith(rule.commandPrefix);
  }
  return false;
}

export function decidePermission(request: PermissionRequest): PermissionDecision {
  let tool: ToolDefinition;
  try {
    tool = getToolDefinition(request.tool.name);
  } catch {
    return { decision: 'deny', reason: 'unknown tool' };
  }

  if (isDangerousPath(request.workspaceRoot, request.input?.path)) {
    return { decision: 'deny', reason: 'path outside workspace' };
  }

  if (!tool.allowedModes.includes(request.mode)) {
    return { decision: 'deny', reason: `${tool.name} is not allowed in ${request.mode} mode` };
  }

  if (tool.kind === 'read') {
    return { decision: 'allow', reason: `read tool allowed in ${request.mode} mode` };
  }

  if (!tool.requiresPermission) {
    return { decision: 'allow', reason: `${tool.name} allowed in ${request.mode} mode` };
  }

  if (request.mode === 'chat') {
    return { decision: 'deny', reason: 'chat mode is read-only' };
  }
  if (request.mode === 'plan' || request.permissionMode === 'plan') {
    return { decision: 'deny', reason: 'plan mode cannot modify files or run commands' };
  }
  if (request.session?.deniedTools?.has(request.tool.name)) {
    return { decision: 'deny', reason: 'tool denied for this session' };
  }
  if (request.session?.deniedRules?.some((rule) => matchesSessionRule(request, rule))) {
    return { decision: 'deny', reason: 'operation denied for this session' };
  }
  if (request.session?.allowedRules?.some((rule) => matchesSessionRule(request, rule))) {
    return { decision: 'allow', reason: 'operation allowed for this session' };
  }
  if (request.session?.allowedTools?.has(request.tool.name)) {
    return { decision: 'allow', reason: 'tool allowed for this session' };
  }

  if (tool.kind === 'shell' && request.mode === 'agent') {
    const shellClassification = classifyShellInput(request.input);
    if (shellClassification.decision !== 'allow') return shellClassification;
  }

  if (request.mode === 'agent' && request.permissionMode === 'bypass') {
    return { decision: 'allow', reason: 'agent bypass mode' };
  }
  if (request.mode === 'agent') {
    return { decision: 'ask', reason: 'agent mode requires confirmation' };
  }

  return { decision: 'deny', reason: 'mode not allowed for tool' };
}

function classifyShellInput(input?: { path?: string; command?: string; args?: string[]; [key: string]: unknown }): PermissionDecision {
  if (!input || typeof input.command !== 'string') {
    return { decision: 'allow', reason: 'no shell command to classify' };
  }
  const args: string[] = Array.isArray(input.args) ? input.args.map(String) : [];
  const classification = classifyShellCommand(input.command, args);
  if (classification.level === 'catastrophic') {
    return { decision: 'deny', reason: `catastrophic command blocked: ${classification.warning}` };
  }
  if (classification.level === 'destructive') {
    return { decision: 'ask', reason: `destructive command requires confirmation: ${classification.warning}` };
  }
  return { decision: 'allow', reason: 'shell command classified as safe' };
}
