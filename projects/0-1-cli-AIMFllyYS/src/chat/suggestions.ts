/**
 * Unified prompt suggestion model.
 *
 * Adapted from Claude Code src/utils/suggestions/commandSuggestions.ts and
 * src/hooks/useUnifiedSuggestions.ts — ported as a provider-neutral, testable
 * data model without Ink/React or vendor-managed service hooks.
 */

export type SuggestionSource = 'command' | 'path' | 'skill' | 'model' | 'agent';

export interface SuggestionItem {
  id: string;
  displayText: string;
  description: string;
  source: SuggestionSource;
  tag?: string;
  metadata?: unknown;
}

export interface CommandInput {
  id: string;
  command: string;
  description: string;
  aliases?: string[];
  argumentHint?: string;
  loadedFrom?: string;
}

export interface SkillInput {
  id: string;
  name: string;
  description: string;
}

export interface AgentInput {
  id: string;
  name: string;
  description: string;
}

export interface UnifiedSuggestionSources {
  commands?: CommandInput[];
  skills?: SkillInput[];
  models?: string[];
  agents?: AgentInput[];
  pathItems?: SuggestionItem[];
  maxResults?: number;
}

const DEFAULT_MAX_RESULTS = 50;

export function createCommandSuggestion(cmd: CommandInput): SuggestionItem {
  return {
    id: `cmd:${cmd.id}`,
    displayText: cmd.command,
    description: cmd.description,
    source: 'command',
    metadata: cmd,
  };
}

export function createSkillSuggestion(skill: SkillInput): SuggestionItem {
  return {
    id: `skill:${skill.id}`,
    displayText: skill.name,
    description: skill.description,
    source: 'skill',
  };
}

export function createModelSuggestion(modelId: string): SuggestionItem {
  return {
    id: `model:${modelId}`,
    displayText: modelId,
    description: 'Configured model',
    source: 'model',
  };
}

export function createAgentSuggestion(agent: AgentInput): SuggestionItem {
  return {
    id: `agent:${agent.id}`,
    displayText: agent.name,
    description: agent.description,
    source: 'agent',
  };
}

/**
 * Collect suggestions from all configured sources into a single ranked list.
 *
 * Deterministic ordering: commands → paths → skills → models → agents.
 * Each category is internally sorted alphabetically by displayText.
 */
export function collectUnifiedSuggestions(sources: UnifiedSuggestionSources): SuggestionItem[] {
  const max = sources.maxResults ?? DEFAULT_MAX_RESULTS;

  const commandItems = (sources.commands ?? []).map(createCommandSuggestion);
  const pathItems = sources.pathItems ?? [];
  const skillItems = (sources.skills ?? []).map(createSkillSuggestion);
  const modelItems = (sources.models ?? []).map(createModelSuggestion);
  const agentItems = (sources.agents ?? []).map(createAgentSuggestion);

  const sortByDisplay = (a: SuggestionItem, b: SuggestionItem) =>
    a.displayText.localeCompare(b.displayText);

  commandItems.sort(sortByDisplay);
  skillItems.sort(sortByDisplay);
  modelItems.sort(sortByDisplay);
  agentItems.sort(sortByDisplay);

  const merged = [
    ...commandItems,
    ...pathItems,
    ...skillItems,
    ...modelItems,
    ...agentItems,
  ];

  return merged.slice(0, max);
}

/**
 * Filter unified suggestions by a case-insensitive query that matches
 * displayText or description.
 */
export function filterUnifiedSuggestions(items: SuggestionItem[], query: string): SuggestionItem[] {
  if (!query) return items;
  const lower = query.toLowerCase();
  return items.filter(
    (item) =>
      item.displayText.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower),
  );
}
