import type { DesktopAction } from '../action-catalog';

export type Mode = 'chat' | 'agent' | 'plan';
export type InspectorTab = 'plan' | 'tools' | 'diff' | 'preview' | 'settings';
export type InstallCategory = 'cli' | 'ide' | 'environment';
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ConversationSession {
  id: string;
  title: string;
  subtitle: string;
  status: 'active' | 'ready' | 'queued';
}

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  meta?: string;
  streaming?: boolean;
}

/**
 * File change descriptor that can ride along on an activity / tool event.
 * Emitted for write/edit tool results so the renderer can draw a Claude-style
 * diff card.
 */
export interface FileChange {
  path: string;
  operation: 'create' | 'edit' | 'delete' | 'rename' | string;
  added?: number;
  removed?: number;
  changed?: number;
  /** Optional per-line diff for a real diff grid. */
  hunks?: DiffLine[];
}

export interface DiffLine {
  marker: '+' | '-' | ' ';
  /** Right-aligned line number in the resulting file (undefined for removed lines). */
  lineNo?: number;
  code: string;
}

/**
 * Status of a single live activity row in the agent timeline.
 */
export type ActivityStatus = 'loading' | 'success' | 'error' | 'waiting' | 'info';

export type ActivityKind =
  | 'thinking'
  | 'tool'
  | 'subagent'
  | 'permission'
  | 'plan'
  | 'note';

/**
 * A single row in the live agent-orchestration timeline. Built by reducing the
 * raw AgentTurnEvent stream pushed from the main process.
 */
export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  status: ActivityStatus;
  detail?: string;
  /** Tool / subagent name in mono. */
  name?: string;
  /** Collapsible JSON-ish args preview. */
  args?: string;
  /** Collapsible result preview. */
  result?: string;
  /** Subagent lane index -> reserved subagent color. */
  laneIndex?: number;
  /** Optional file change to render as a diff card. */
  file?: FileChange;
}

/**
 * Raw agent-turn event pushed over window.zeroOneCli.onAiEvent. Mirrors
 * src/chat/agent/loop.ts AgentTurnEvent. Extra optional fields are tolerated.
 */
export interface AgentTurnEvent {
  type:
    | 'turn_start'
    | 'assistant_message'
    | 'tool_start'
    | 'tool_result'
    | 'permission_required'
    | 'plan_approval_required'
    | 'turn_complete';
  round?: number;
  messageCount?: number;
  content?: string;
  toolCallCount?: number;
  toolCallId?: string;
  toolName?: string;
  permissionDecision?: 'allow' | 'deny' | 'ask' | string;
  reason?: string;
  status?: 'completed' | 'max_tool_rounds';
  toolResultCount?: number;
  planPreview?: string;
  permissionCount?: number;
  /** Optional structured args/result the backend may attach for the UI. */
  args?: string;
  contentPreview?: string;
  result?: string;
  /** Subagent identity for task delegation lanes. */
  subagentId?: string;
  subagentLabel?: string;
  /** Optional file change carried by write/edit tool results. */
  file?: FileChange;
}

export interface AiEventEnvelope {
  sessionId: string;
  event: AgentTurnEvent;
}

export interface InstallTarget {
  key: string;
  displayName: string;
  category: InstallCategory;
  description: string;
  sourceUrl: string;
  opensUrlOnly?: boolean;
}

export interface SkillPackage {
  key: string;
  displayName: string;
  description: string;
  sourceUrl: string;
  sourceType: 'local' | 'git';
}

export interface SkillTarget {
  key: string;
  displayName: string;
  path: string;
  detected: boolean;
}

export interface ClearProcess {
  pid: number;
  name: string;
  memoryMB: number;
  cpuSeconds: number;
  path?: string;
  windowTitle?: string;
  reason: string;
}

export interface ReleaseAsset {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface ReleaseInfo {
  ok: boolean;
  tagName?: string;
  name?: string;
  htmlUrl?: string;
  publishedAt?: string;
  assets?: ReleaseAsset[];
  error?: string;
}

export interface DesktopAiRequest {
  sessionId: string;
  mode: Mode;
  text: string;
}

export interface DesktopAiResponse {
  ok: boolean;
  message?: ConversationMessage;
  output?: string;
  error?: string;
}

export interface DesktopBridge {
  runCommand: (command: string) => Promise<{ ok: boolean; output: string }>;
  launchAiSession: (request?: { mode?: Mode }) => Promise<{ ok: boolean; output: string }>;
  sendAiMessage: (request: DesktopAiRequest) => Promise<DesktopAiResponse>;
  onAiEvent?: (callback: (payload: AiEventEnvelope) => void) => () => void;
  getLatestRelease: () => Promise<ReleaseInfo>;
  openLatestRelease: () => Promise<{ ok: boolean; url: string; error?: string }>;
  openReleaseAsset: (url: string) => Promise<{ ok: boolean; url: string; error?: string }>;
  listInstallTargets: () => Promise<InstallTarget[]>;
  runInstallTarget: (request: { key: string; latest?: boolean; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
  listSkillPackages: () => Promise<{ packages: SkillPackage[]; targets: SkillTarget[] }>;
  installSkillPackage: (request: { skillKey: string; targetKeys: string[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
  scanClearProcesses: () => Promise<{ ok: boolean; processes: ClearProcess[]; total: number; filtered: number; output: string }>;
  killClearProcesses: (request: { pids: number[]; confirm?: boolean }) => Promise<{ ok: boolean; output: string; requiresConfirmation?: boolean }>;
}

export type ActiveActionId = DesktopAction['id'] | null;

/** Reserved palette for distinguishing concurrent subagents. */
export const SUBAGENT_COLORS = [
  '#dc2626',
  '#2563eb',
  '#16a34a',
  '#ca8a04',
  '#9333ea',
  '#ea580c',
  '#db2799',
  '#0891b2',
] as const;

declare global {
  interface Window {
    zeroOneCli?: DesktopBridge;
  }
}
