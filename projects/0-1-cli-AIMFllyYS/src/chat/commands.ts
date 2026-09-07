import { ModelInfo } from '../types';
import { AiSettings } from './config';

export interface ParsedSlashCommand {
  command: string;
  args: string;
  rawCommand?: string;
}

export interface SlashMenuItem {
  id: string;
  command: string;
  description: string;
  aliases?: string[];
  argumentHint?: string;
  isHidden?: boolean;
  mode?: 'chat' | 'agent' | 'plan' | 'all';
  category?: 'Mode' | 'Agent' | 'Runtime' | 'Skills' | 'Help';
  loadedFrom?: 'builtin' | 'skills' | 'plugin' | 'mcp' | 'bundled';
}

export interface SlashCommandDefinition extends SlashMenuItem {
  type: 'local';
  loadedFrom: 'builtin';
}

const COMMAND_DEFINITIONS: SlashCommandDefinition[] = [
  { id: 'chat', command: '/chat', type: 'local', loadedFrom: 'builtin', category: 'Mode', description: 'Switch to read-only code conversation mode', mode: 'all' },
  { id: 'agent', command: '/agent', type: 'local', loadedFrom: 'builtin', category: 'Mode', description: 'Switch to tool-using agent mode', mode: 'all' },
  { id: 'plan', command: '/plan', type: 'local', loadedFrom: 'builtin', category: 'Mode', description: 'Plan work without editing files', mode: 'all' },
  { id: 'plan-open', command: '/plan open', type: 'local', loadedFrom: 'builtin', category: 'Mode', description: 'Show the current saved plan file', mode: 'all' },
  { id: 'agent-spawn', command: '/agent spawn <task>', type: 'local', loadedFrom: 'builtin', category: 'Agent', description: 'Start a scoped local subagent', argumentHint: '<task>', mode: 'agent' },
  { id: 'agent-list', command: '/agent list', type: 'local', loadedFrom: 'builtin', category: 'Agent', description: 'Show queued and running subagents', mode: 'agent' },
  { id: 'agent-defs', command: '/agent defs', type: 'local', loadedFrom: 'builtin', category: 'Agent', description: 'List built-in and local agent definitions', mode: 'agent' },
  { id: 'agent-cancel', command: '/agent cancel <id>', type: 'local', loadedFrom: 'builtin', category: 'Agent', description: 'Cancel a queued or running subagent', argumentHint: '<id>', mode: 'agent' },
  { id: 'setting', command: '/setting', aliases: ['/settings'], type: 'local', loadedFrom: 'builtin', category: 'Runtime', description: 'Configure URL, API key, and model IDs', argumentHint: 'URL / API Key / Model IDs', mode: 'all' },
  { id: 'model', command: '/model', aliases: ['/m'], type: 'local', loadedFrom: 'builtin', category: 'Runtime', description: 'Choose a configured model', argumentHint: '[model id]', mode: 'all' },
  { id: 'model-info', command: '/model info', type: 'local', loadedFrom: 'builtin', category: 'Runtime', description: 'Show active model metadata', mode: 'all' },
  { id: 'search', command: '/search <query>', aliases: ['/s'], type: 'local', loadedFrom: 'builtin', category: 'Runtime', description: 'Search the web and summarize results', argumentHint: '<query>', mode: 'all' },
  { id: 'clear', command: '/clear', aliases: ['/c'], type: 'local', loadedFrom: 'builtin', category: 'Runtime', description: 'Clear conversation history', mode: 'all' },
  { id: 'skills', command: '/skills', type: 'local', loadedFrom: 'builtin', category: 'Skills', description: 'List runtime skills', mode: 'all' },
  { id: 'skills-search', command: '/skills search <query>', type: 'local', loadedFrom: 'builtin', category: 'Skills', description: 'Search runtime skills by id, name, description, or trigger text', argumentHint: '<query>', mode: 'all' },
  { id: 'skill', command: '/skill <id|name>', type: 'local', loadedFrom: 'builtin', category: 'Skills', description: 'Load a skill into the AI context', argumentHint: '<id|name>', mode: 'all' },
  { id: 'help', command: '/help', aliases: ['/h'], type: 'local', loadedFrom: 'builtin', category: 'Help', description: 'Show help and slash commands', mode: 'all' },
  { id: 'exit', command: '/exit', aliases: ['/quit', '/q'], type: 'local', loadedFrom: 'builtin', category: 'Help', description: 'Exit after confirmation', mode: 'all' },
];

export const SLASH_MENU_ITEMS: SlashMenuItem[] = COMMAND_DEFINITIONS;

export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  const resolved = resolveSlashCommand(input);
  if (resolved) return resolved;

  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const [command, ...rest] = trimmed.split(/\s+/);
  return { command: command.toLowerCase(), args: rest.join(' ') };
}

export function resolveSlashCommand(input: string): ParsedSlashCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed === '/') return { command: '/', args: '' };
  const [command, ...rest] = trimmed.split(/\s+/);
  const rawCommand = command.toLowerCase();
  const canonical = COMMAND_DEFINITIONS.find((item) => {
    const names = [commandToken(item.command), ...(item.aliases || [])];
    return names.map((name) => name.toLowerCase()).includes(rawCommand);
  });
  if (!canonical) return null;
  const canonicalCommand = commandToken(canonical.command);
  return {
    command: canonicalCommand,
    args: rest.join(' '),
    ...(rawCommand !== canonicalCommand ? { rawCommand } : {}),
  };
}

function commandToken(command: string): string {
  return command.split(/\s+/)[0].toLowerCase();
}

function modeAllows(item: SlashMenuItem, mode: 'chat' | 'agent' | 'plan'): boolean {
  return item.mode === 'all' || item.mode === mode;
}

export function getSlashCommandDefinitions(mode: 'chat' | 'agent' | 'plan' = 'chat'): SlashCommandDefinition[] {
  return COMMAND_DEFINITIONS.filter((item) => !item.isHidden && modeAllows(item, mode));
}

export function getSlashMenuItems(mode: 'chat' | 'agent' | 'plan' = 'chat'): SlashMenuItem[] {
  return getSlashCommandDefinitions(mode);
}

export function formatDescriptionWithSource(item: SlashMenuItem): string {
  if (!item.loadedFrom) return item.description;
  return `${item.description} [${item.loadedFrom}]`;
}

export function formatSlashMenu(mode: 'chat' | 'agent' | 'plan' = 'chat'): string {
  const items = getSlashMenuItems(mode);
  const commandWidth = Math.max(...items.map((item) => item.command.length), 0);
  const categories: NonNullable<SlashMenuItem['category']>[] = ['Mode', 'Agent', 'Runtime', 'Skills', 'Help'];
  const groups = categories
    .map((category) => ({
      category,
      items: items.filter((item) => (item.category || 'Runtime') === category),
    }))
    .filter((group) => group.items.length > 0);

  return groups
    .map((group) => [
      group.category,
      ...group.items.map((item) => `  ${item.command.padEnd(commandWidth)}  ${formatDescriptionWithSource(item)}`),
    ].join('\n'))
    .join('\n\n');
}

export function formatModelOptions(models: ModelInfo[], activeId: string): string[] {
  return models.map((model) => `${model.id}${model.id === activeId ? ' (current)' : ''}`);
}

function formatProviderLabel(provider: ModelInfo['provider']): string {
  if (provider === 'deepseek') return 'DeepSeek';
  if (provider === 'zhipu') return '智谱 GLM';
  return 'Custom (OpenAI-compatible)';
}

function formatModalities(modalities?: string[]): string {
  if (!modalities?.length) return '未知';
  if (modalities.some((item) => /vision|image|multimodal/i.test(item))) {
    return modalities.includes('text') ? '文本 + 视觉' : '视觉';
  }
  return '仅文本';
}

export function formatModelInfo(model: ModelInfo): string {
  const lines = [
    `名称: ${model.name}`,
    `ID: ${model.id}`,
    `厂商: ${formatProviderLabel(model.provider)}`,
    `来源: ${model.source === 'custom' ? '自定义' : '内置'}`,
    `上下文: ${model.contextLength ? `${model.contextLength.toLocaleString('en-US')} tokens` : '未知'}`,
    `工具调用: ${model.supportsTools === false ? '不支持' : '支持'}`,
    `多模态: ${formatModalities(model.modalities)}`,
    `OpenAI 兼容: ${model.openAiCompatible === false ? '否' : '是'}`,
  ];
  if (model.supportsSearch) lines.push('联网搜索: 支持');
  return lines.join('\n');
}

export function applyModelSelection(id: string, settings: AiSettings): AiSettings {
  const selected = id.trim();
  if (!settings.modelIds.includes(selected)) {
    throw new Error(`Unknown model: ${selected}`);
  }
  return { ...settings, activeModelId: selected };
}

export type ModelCommand =
  | { kind: 'selector' }
  | { kind: 'info' }
  | { kind: 'select'; modelId: string };

export function resolveModelCommand(args: string): ModelCommand {
  const trimmed = args.trim();
  if (!trimmed) return { kind: 'selector' };
  if (trimmed.toLowerCase() === 'info') return { kind: 'info' };
  return { kind: 'select', modelId: trimmed };
}

export type SkillsCommand =
  | { kind: 'list' }
  | { kind: 'search'; query: string };

export function resolveSkillsCommand(args: string): SkillsCommand {
  const trimmed = args.trim();
  if (!trimmed || trimmed.toLowerCase() === 'list') return { kind: 'list' };
  if (trimmed.toLowerCase() === 'search') return { kind: 'search', query: '' };
  if (trimmed.toLowerCase().startsWith('search ')) {
    return { kind: 'search', query: trimmed.slice('search '.length).trim() };
  }
  return { kind: 'list' };
}

export function isAgentDefinitionsCommand(args: string): boolean {
  const normalized = args.trim().toLowerCase();
  return normalized === 'defs' || normalized === 'definitions';
}

export function formatAgentDefinitionsList(
  agents: Array<{ agentType: string; whenToUse: string; source: string; permissionMode?: string }>
): string {
  if (!agents.length) return 'No agent definitions found.';
  const typeWidth = Math.max(...agents.map((agent) => agent.agentType.length), 'agentType'.length);
  return agents
    .map((agent) => {
      const permission = agent.permissionMode ? ` permission=${agent.permissionMode}` : '';
      return `${agent.agentType.padEnd(typeWidth)}  [${agent.source}]${permission}  ${agent.whenToUse}`;
    })
    .join('\n');
}
