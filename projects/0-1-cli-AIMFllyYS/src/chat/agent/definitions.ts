import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PermissionMode } from '../session';

export type AgentDefinitionSource = 'built-in' | 'user' | 'project';
export type AgentMemoryScope = 'user' | 'project' | 'local';

export interface AgentDefinition {
  agentType: string;
  whenToUse: string;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  model?: string;
  permissionMode?: PermissionMode;
  maxTurns?: number;
  background?: boolean;
  memory?: AgentMemoryScope;
  source: AgentDefinitionSource;
  baseDir: string;
  systemPrompt: string;
}

const READ_TOOLS = ['list_files', 'read_file', 'search_files'];
const MUTATING_TOOLS = ['write_file', 'shell', 'task'];
const SNAPSHOT_BASE = 'agent-memory-snapshots';
const SNAPSHOT_JSON = 'snapshot.json';
const SYNCED_JSON = '.snapshot-synced.json';

export function getBuiltInAgentDefinitions(): AgentDefinition[] {
  return [
    {
      agentType: 'general-purpose',
      whenToUse: 'General-purpose agent for researching code, inspecting files, and executing scoped multi-step tasks.',
      tools: ['*'],
      source: 'built-in',
      baseDir: 'built-in',
      systemPrompt: [
        'You are a scoped 0-1 CLI subagent.',
        'Search broadly, read relevant files, and complete the delegated task without gold-plating.',
        'Prefer editing existing files over creating new ones. Preserve UTF-8 exactly, especially Chinese text.',
        'Return a concise report with what you did, key findings, verification, and remaining risks.',
      ].join('\n'),
    },
    {
      agentType: 'explore',
      whenToUse: 'Fast read-only agent for exploring codebases, finding files by pattern, and answering codebase questions.',
      tools: READ_TOOLS,
      disallowedTools: MUTATING_TOOLS,
      permissionMode: 'plan',
      source: 'built-in',
      baseDir: 'built-in',
      systemPrompt: [
        'You are a read-only codebase exploration specialist for 0-1 CLI.',
        'READ-ONLY MODE: do not create, edit, delete, move, copy, install, commit, or run commands that mutate state.',
        'Use list_files, read_file, and search_files to locate and inspect relevant code.',
        'Return findings directly in your response. Do not attempt to write files.',
      ].join('\n'),
    },
    {
      agentType: 'plan',
      whenToUse: 'Read-only software architect agent for exploring the codebase and designing implementation plans.',
      tools: READ_TOOLS,
      disallowedTools: MUTATING_TOOLS,
      permissionMode: 'plan',
      source: 'built-in',
      baseDir: 'built-in',
      systemPrompt: [
        'You are a planning specialist for 0-1 CLI.',
        'READ-ONLY MODE: do not create, edit, delete, move, copy, install, commit, or run commands that mutate state.',
        'Explore existing files and patterns, then produce an implementation plan.',
        'End with Critical Files for Implementation and a Verification section.',
      ].join('\n'),
    },
    {
      agentType: 'verification',
      whenToUse: 'Verification-only agent for trying to break completed implementation work before it is reported done.',
      tools: ['list_files', 'read_file', 'search_files', 'shell'],
      disallowedTools: ['write_file', 'task'],
      permissionMode: 'ask',
      background: true,
      source: 'built-in',
      baseDir: 'built-in',
      systemPrompt: [
        'You are a verification specialist for 0-1 CLI. Your job is to try to break the implementation, not rubber-stamp it.',
        'Do not modify project files, install packages, or run git write operations.',
        'Run build, tests, type checks, and at least one adversarial probe that fits the change.',
        'Report exact commands, observed output, and end with VERDICT: PASS, VERDICT: FAIL, or VERDICT: PARTIAL.',
      ].join('\n'),
    },
  ];
}

function sanitizeAgentTypeForPath(agentType: string): string {
  return agentType.replace(/:/g, '-');
}

function resolveHomeDir(homeDir?: string): string {
  return homeDir || process.env.USERPROFILE || process.env.HOME || os.homedir();
}

export function getAgentMemoryDir(
  agentType: string,
  scope: AgentMemoryScope,
  workspaceRoot: string,
  homeDir?: string
): string {
  const dirName = sanitizeAgentTypeForPath(agentType);
  switch (scope) {
    case 'project':
      return path.join(path.resolve(workspaceRoot), '.0-1-cli', 'agent-memory', dirName);
    case 'local':
      return path.join(path.resolve(workspaceRoot), '.0-1-cli', 'agent-memory-local', dirName);
    case 'user':
      return path.join(resolveHomeDir(homeDir), '.0-1-cli', 'agent-memory', dirName);
  }
}

export function getSnapshotDirForAgent(agentType: string, workspaceRoot: string): string {
  return path.join(path.resolve(workspaceRoot), '.0-1-cli', SNAPSHOT_BASE, sanitizeAgentTypeForPath(agentType));
}

function readJsonFile<T>(filePath: string, validate: (value: unknown) => value is T): T | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return validate(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isSnapshotMeta(value: unknown): value is { updatedAt: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as { updatedAt?: unknown }).updatedAt === 'string');
}

function isSyncedMeta(value: unknown): value is { syncedFrom: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as { syncedFrom?: unknown }).syncedFrom === 'string');
}

function hasLocalMemoryFiles(memoryDir: string): boolean {
  if (!fs.existsSync(memoryDir)) return false;
  return fs.readdirSync(memoryDir, { withFileTypes: true })
    .some((entry) => entry.isFile() && entry.name.endsWith('.md'));
}

function copySnapshotToLocal(agentType: string, scope: AgentMemoryScope, workspaceRoot: string, homeDir?: string): void {
  const snapshotDir = getSnapshotDirForAgent(agentType, workspaceRoot);
  const localMemDir = getAgentMemoryDir(agentType, scope, workspaceRoot, homeDir);
  fs.mkdirSync(localMemDir, { recursive: true });

  if (!fs.existsSync(snapshotDir)) return;
  fs.readdirSync(snapshotDir, { withFileTypes: true }).forEach((entry) => {
    if (!entry.isFile() || entry.name === SNAPSHOT_JSON) return;
    const content = fs.readFileSync(path.join(snapshotDir, entry.name), 'utf8');
    fs.writeFileSync(path.join(localMemDir, entry.name), content, 'utf8');
  });
}

function saveSyncedMeta(
  agentType: string,
  scope: AgentMemoryScope,
  workspaceRoot: string,
  snapshotTimestamp: string,
  homeDir?: string
): void {
  const localMemDir = getAgentMemoryDir(agentType, scope, workspaceRoot, homeDir);
  fs.mkdirSync(localMemDir, { recursive: true });
  fs.writeFileSync(
    path.join(localMemDir, SYNCED_JSON),
    JSON.stringify({ syncedFrom: snapshotTimestamp }),
    'utf8'
  );
}

export function checkAgentMemorySnapshot(
  agentType: string,
  scope: AgentMemoryScope,
  workspaceRoot: string,
  homeDir?: string
): { action: 'none' | 'initialize' | 'prompt-update'; snapshotTimestamp?: string } {
  const snapshotMeta = readJsonFile(
    path.join(getSnapshotDirForAgent(agentType, workspaceRoot), SNAPSHOT_JSON),
    isSnapshotMeta
  );
  if (!snapshotMeta) return { action: 'none' };

  const localMemDir = getAgentMemoryDir(agentType, scope, workspaceRoot, homeDir);
  if (!hasLocalMemoryFiles(localMemDir)) {
    return { action: 'initialize', snapshotTimestamp: snapshotMeta.updatedAt };
  }

  const syncedMeta = readJsonFile(path.join(localMemDir, SYNCED_JSON), isSyncedMeta);
  if (!syncedMeta || new Date(snapshotMeta.updatedAt) > new Date(syncedMeta.syncedFrom)) {
    return { action: 'prompt-update', snapshotTimestamp: snapshotMeta.updatedAt };
  }

  return { action: 'none' };
}

export function initializeFromSnapshot(
  agentType: string,
  scope: AgentMemoryScope,
  workspaceRoot: string,
  snapshotTimestamp: string,
  homeDir?: string
): void {
  copySnapshotToLocal(agentType, scope, workspaceRoot, homeDir);
  saveSyncedMeta(agentType, scope, workspaceRoot, snapshotTimestamp, homeDir);
}

export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
  workspaceRoot: string,
  homeDir?: string
): string {
  const memoryDir = getAgentMemoryDir(agentType, scope, workspaceRoot, homeDir);
  fs.mkdirSync(memoryDir, { recursive: true });

  const entrypoint = path.join(memoryDir, 'MEMORY.md');
  let memoryBody = '';
  if (fs.existsSync(entrypoint)) {
    memoryBody = fs.readFileSync(entrypoint, 'utf8').trim();
  }

  const scopeNote = scope === 'user'
    ? '- Since this memory is user-scope, keep learnings general since they apply across all projects'
    : scope === 'project'
      ? '- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project'
      : '- Since this memory is local-scope (not checked into version control), tailor your memories to this project and machine';

  const lines = [
    '# Persistent Agent Memory',
    `Memory directory: ${memoryDir}`,
    scopeNote,
    'You may update MEMORY.md when you learn durable facts that help future runs.',
  ];
  if (memoryBody) {
    lines.push('', '## Current Memory', memoryBody);
  }
  return lines.join('\n');
}

export function resolveAgentSystemPrompt(agent: AgentDefinition, workspaceRoot: string, homeDir?: string): string {
  if (!agent.memory) return agent.systemPrompt;

  const snapshot = checkAgentMemorySnapshot(agent.agentType, agent.memory, workspaceRoot, homeDir);
  if (snapshot.action === 'initialize' && snapshot.snapshotTimestamp) {
    initializeFromSnapshot(agent.agentType, agent.memory, workspaceRoot, snapshot.snapshotTimestamp, homeDir);
  }

  return `${agent.systemPrompt}\n\n${loadAgentMemoryPrompt(agent.agentType, agent.memory, workspaceRoot, homeDir)}`;
}

function splitCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const values = value.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (/^(true|yes|1)$/i.test(value.trim())) return true;
  if (/^(false|no|0)$/i.test(value.trim())) return false;
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePermissionMode(value: string | undefined): PermissionMode | undefined {
  if (value === 'ask' || value === 'bypass' || value === 'plan') return value;
  return undefined;
}

function parseMemoryScope(value: string | undefined): AgentMemoryScope | undefined {
  if (value === 'user' || value === 'project' || value === 'local') return value;
  return undefined;
}

function parseAgentMarkdown(filePath: string, baseDir: string, source: AgentDefinitionSource): AgentDefinition | null {
  const raw = fs.readFileSync(filePath, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(raw);
  const frontmatter: Record<string, string> = {};
  const body = match ? match[2] : raw;

  if (match) {
    match[1].split(/\r?\n/).forEach((line) => {
      const separator = line.indexOf(':');
      if (separator <= 0) return;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (key) frontmatter[key] = value.replace(/^['"]|['"]$/g, '');
    });
  }

  const agentType = frontmatter.name?.trim() || path.basename(filePath, path.extname(filePath));
  const systemPrompt = body.trim();
  if (!systemPrompt) return null;

  return {
    agentType,
    whenToUse: frontmatter.description || `Local agent ${agentType}`,
    tools: splitCsv(frontmatter.tools),
    disallowedTools: splitCsv(frontmatter.disallowedTools),
    skills: splitCsv(frontmatter.skills),
    model: frontmatter.model,
    permissionMode: parsePermissionMode(frontmatter.permissionMode),
    maxTurns: parsePositiveInt(frontmatter.maxTurns),
    background: parseBoolean(frontmatter.background),
    memory: parseMemoryScope(frontmatter.memory),
    source,
    baseDir,
    systemPrompt,
  };
}

function listAgentDefinitionsFromDir(baseDir: string, source: AgentDefinitionSource): AgentDefinition[] {
  if (!fs.existsSync(baseDir)) return [];
  return fs.readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => parseAgentMarkdown(path.join(baseDir, entry.name), baseDir, source))
    .filter((agent): agent is AgentDefinition => Boolean(agent));
}

export function listUserAgentDefinitions(homeDir?: string): AgentDefinition[] {
  const baseDir = path.join(resolveHomeDir(homeDir), '.0-1-cli', 'agents');
  return listAgentDefinitionsFromDir(baseDir, 'user');
}

export function listProjectAgentDefinitions(workspaceRoot: string): AgentDefinition[] {
  const baseDir = path.join(path.resolve(workspaceRoot), '.0-1-cli', 'agents');
  return listAgentDefinitionsFromDir(baseDir, 'project');
}

export function listAgentDefinitions(workspaceRoot: string = process.cwd(), homeDir?: string): AgentDefinition[] {
  const groups = [
    getBuiltInAgentDefinitions(),
    listUserAgentDefinitions(homeDir),
    listProjectAgentDefinitions(workspaceRoot),
  ];
  const byType = new Map<string, AgentDefinition>();
  groups.forEach((agents) => {
    agents.forEach((agent) => byType.set(agent.agentType, agent));
  });
  return Array.from(byType.values());
}

export function resolveAgentDefinition(
  workspaceRoot: string,
  agentType = 'general-purpose',
  homeDir?: string
): AgentDefinition {
  const agents = listAgentDefinitions(workspaceRoot, homeDir);
  const agent = agents.find((item) => item.agentType === agentType)
    || agents.find((item) => item.agentType === 'general-purpose')
    || getBuiltInAgentDefinitions()[0];
  return {
    ...agent,
    systemPrompt: resolveAgentSystemPrompt(agent, workspaceRoot, homeDir),
  };
}
