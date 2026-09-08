import { AiMode, PermissionMode } from './session';
import { buildSystemPrompt } from './prompt';
import { listFilesTool, readFileTool, searchFilesTool } from './tools/fs-read';
import { buildProviderToolSpecs, toolForLegacyCommand } from './tools/registry';

/**
 * Read-only legacy commands for AI chat.
 * SAFETY: No write/delete/modify operations are exposed here.
 */
export async function executeTool(command: string): Promise<string> {
  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');
  const workspaceRoot = process.cwd();
  const tool = toolForLegacyCommand(cmd);
  if (!tool) return 'Unknown tool: ' + cmd + '\nAvailable tools: ls, dir, read, grep';

  if (tool.name === 'list_files') {
    return listFilesTool({ path: args || '.', workspaceRoot });
  }

  if (tool.name === 'read_file') {
    if (!args) return 'Error: please provide a file path';
    return readFileTool({ path: args, workspaceRoot });
  }

  if (tool.name === 'search_files') {
    const [pattern, ...rest] = args.split(/\s+/);
    if (!pattern) return 'Error: please provide a search pattern';
    return searchFilesTool({ pattern, path: rest.join(' ') || '.', workspaceRoot });
  }

  return 'Unknown tool: ' + cmd + '\nAvailable tools: ls, dir, read, grep';
}

export interface SystemPromptOptions {
  workspaceRoot?: string;
  mode?: AiMode;
  permissionMode?: PermissionMode;
  modelId?: string;
  toolNames?: string[];
  activeSkillNames?: string[];
}

export function getSystemPrompt(options: SystemPromptOptions = {}): string {
  const mode = options.mode || 'chat';
  return buildSystemPrompt({
    workspaceRoot: options.workspaceRoot || process.cwd(),
    mode,
    permissionMode: options.permissionMode || 'ask',
    modelId: options.modelId || process.env.AI_MODEL || 'default',
    toolNames: options.toolNames || buildProviderToolSpecs(mode).map((tool) => tool.function.name),
    activeSkillNames: options.activeSkillNames,
  });
}

export function isToolCommand(input: string): boolean {
  return /^(ls|dir|read|cat|type|grep|rg)\b/i.test(input.trim());
}
