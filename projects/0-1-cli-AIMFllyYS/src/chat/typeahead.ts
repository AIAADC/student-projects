import * as readline from 'readline';
import chalk from 'chalk';
import { getSlashMenuItems, SlashMenuItem } from './commands';
import { resolveOverlayDismissKeyAction, resolveSlashPromptKeyAction } from './keybindings';
import { AiMode } from './session';
import { glyphs } from './terminal-ui';
import { isPathLikeToken, getPathSuggestions } from './path-completion';
import { visibleLength } from './ui/theme';
import type { SuggestionItem } from './suggestions';
import {
  collectUnifiedSuggestions,
  filterUnifiedSuggestions,
  createCommandSuggestion,
} from './suggestions';

export interface SlashSuggestion {
  id: string;
  command: string;
  description: string;
  argumentHint?: string;
  loadedFrom?: SlashMenuItem['loadedFrom'];
  matchedAlias?: string;
}

export interface SlashTypeaheadState {
  active: boolean;
  input: string;
  mode: AiMode;
  suggestions: SlashSuggestion[];
  selectedIndex: number;
  commandWidth: number;
}

export type SlashApplyAction =
  | { action: 'none'; input: string }
  | { action: 'complete'; input: string }
  | { action: 'execute'; input: string };

export interface MidInputSlashCommand {
  token: string;
  startPos: number;
  partialCommand: string;
}

export interface SlashPromptOptions {
  prompt: string;
  mode: AiMode;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
  onOverlayChange?: (active: boolean) => void;
  signal?: AbortSignal;
  // Submitted-prompt history (oldest first). Up/Down recall entries when the slash overlay is closed.
  history?: string[];
}

function visibleCommand(item: SlashMenuItem): string {
  return item.command.replace(/\s+<[^>]+>/g, '');
}

function toSuggestion(item: SlashMenuItem, matchedAlias?: string): SlashSuggestion {
  return {
    id: item.id,
    command: visibleCommand(item),
    description: item.description,
    ...(item.argumentHint ? { argumentHint: item.argumentHint } : {}),
    ...(item.loadedFrom ? { loadedFrom: item.loadedFrom } : {}),
    ...(matchedAlias ? { matchedAlias } : {}),
  };
}

const COMMAND_PART_SEPARATORS = /[:_-]/g;

function normalizeCommandQuery(value: string): string {
  return value.toLowerCase().replace(/^\//, '').trim();
}

function cleanQuery(value: string): string {
  return value.toLowerCase().replace(/^\//, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function slashlessCommand(item: SlashMenuItem): string {
  return visibleCommand(item).replace(/^\//, '').toLowerCase();
}

function findMatchedAlias(query: string, aliases?: string[]): string | undefined {
  if (!query || !aliases?.length) return undefined;
  const normalized = aliases.map((alias) => ({ alias, query: normalizeCommandQuery(alias) }));
  return normalized.find((alias) => alias.query === query)?.alias
    || normalized
      .filter((alias) => alias.query.startsWith(query))
      .sort((a, b) => a.query.length - b.query.length)[0]?.alias;
}

function rankSlashMatch(item: SlashMenuItem, query: string): number {
  if (query === '') return 0;

  const command = slashlessCommand(item);
  const aliases = (item.aliases || []).map(normalizeCommandQuery);
  if (command === query) return 0;
  if (aliases.some((alias) => alias === query)) return 1;
  if (command.startsWith(query)) return 2;
  if (aliases.some((alias) => alias.startsWith(query))) return 3;

  const commandParts = command.split(COMMAND_PART_SEPARATORS).filter(Boolean);
  if (commandParts.length > 1 && commandParts.some((part) => part.startsWith(query))) return 4;

  const descriptionQuery = cleanQuery(query);
  if (descriptionQuery) {
    const descriptionWords = cleanQuery(item.description).split(/\s+/).filter(Boolean);
    if (descriptionWords.some((word) => word.startsWith(descriptionQuery))) return 5;
  }

  return Number.POSITIVE_INFINITY;
}

export function generateSlashSuggestions(input: string, items: SlashMenuItem[]): SlashSuggestion[] {
  if (!input.startsWith('/')) return [];
  if (/\s$/.test(input)) return [];

  const visibleItems = items.filter((item) => !item.isHidden);
  const query = normalizeCommandQuery(input);
  if (!query) return visibleItems.map((item) => toSuggestion(item));

  const rankedItems = visibleItems
    .map((item) => ({ item, rank: rankSlashMatch(item, query), matchedAlias: findMatchedAlias(query, item.aliases) }))
    .filter((entry) => entry.rank < Number.POSITIVE_INFINITY);
  const hasNameOrAliasMatch = rankedItems.some((entry) => entry.rank < 4);
  return rankedItems
    .filter((entry) => !hasNameOrAliasMatch || entry.rank < 4)
    .sort((a, b) => {
      const rankDiff = a.rank - b.rank;
      if (rankDiff !== 0) return rankDiff;
      return slashlessCommand(a.item).length - slashlessCommand(b.item).length;
    })
    .map((entry) => toSuggestion(entry.item, entry.matchedAlias));
}

export function createSlashTypeaheadState(input: string, mode: AiMode): SlashTypeaheadState {
  if (!input.startsWith('/')) {
    return { active: false, input, mode, suggestions: [], selectedIndex: -1, commandWidth: 0 };
  }
  if (/\s$/.test(input)) {
    return { active: false, input, mode, suggestions: [], selectedIndex: -1, commandWidth: 0 };
  }

  const items = getSlashMenuItems(mode);
  const commandWidth = Math.max(...items.map((item) => item.command.length), 0);
  const suggestions = generateSlashSuggestions(input, items);

  return {
    active: suggestions.length > 0,
    input,
    mode,
    suggestions,
    selectedIndex: suggestions.length > 0 ? 0 : -1,
    commandWidth,
  };
}

export function findMidInputSlashCommand(input: string, cursorOffset: number): MidInputSlashCommand | null {
  if (input.startsWith('/')) return null;

  const beforeCursor = input.slice(0, cursorOffset);
  const match = beforeCursor.match(/\s\/([a-zA-Z0-9_:-]*)$/);
  if (!match || match.index === undefined) return null;

  const slashPos = match.index + 1;
  const textAfterSlash = input.slice(slashPos + 1);
  const commandMatch = textAfterSlash.match(/^[a-zA-Z0-9_:-]*/);
  const fullCommand = commandMatch ? commandMatch[0] : '';
  if (cursorOffset > slashPos + 1 + fullCommand.length) return null;

  return {
    token: '/' + fullCommand,
    startPos: slashPos,
    partialCommand: fullCommand,
  };
}

export function getBestSlashCommandMatch(
  partialCommand: string,
  mode: AiMode,
): { suffix: string; fullCommand: string } | null {
  if (!partialCommand) return null;

  const query = '/' + partialCommand.toLowerCase();
  const suggestions = createSlashTypeaheadState(query, mode).suggestions;
  const match = suggestions.find((item) => item.command.toLowerCase().startsWith(query));
  if (!match) return null;

  const suffix = match.command.slice(query.length);
  return suffix ? { suffix, fullCommand: match.command } : null;
}

export function getMidInputSlashGhostText(
  input: string,
  cursorOffset: number,
  mode: AiMode,
): { text: string; fullCommand: string; insertPosition: number } | null {
  const midInput = findMidInputSlashCommand(input, cursorOffset);
  if (!midInput) return null;

  const match = getBestSlashCommandMatch(midInput.partialCommand, mode);
  if (!match) return null;

  return {
    text: match.suffix,
    fullCommand: match.fullCommand,
    insertPosition: cursorOffset,
  };
}

export function applyMidInputSlashCompletion(
  input: string,
  cursorOffset: number,
  mode: AiMode,
): { input: string; cursorOffset: number; completedCommand: string } | null {
  const midInput = findMidInputSlashCommand(input, cursorOffset);
  if (!midInput) return null;

  const match = getBestSlashCommandMatch(midInput.partialCommand, mode);
  if (!match) return null;

  const before = input.slice(0, midInput.startPos);
  const after = input.slice(midInput.startPos + midInput.token.length);
  const replacement = `${match.fullCommand} `;
  return {
    input: `${before}${replacement}${after}`,
    cursorOffset: before.length + replacement.length,
    completedCommand: match.fullCommand,
  };
}

export function findSlashCommandPositions(text: string): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  const regex = /(^|[\s])(\/[a-zA-Z][a-zA-Z0-9:\-_]*)/g;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(text)) !== null) {
    const precedingChar = match[1] || '';
    const commandName = match[2] || '';
    const start = match.index + precedingChar.length;
    positions.push({ start, end: start + commandName.length });
  }
  return positions;
}

export function moveSlashSelection(state: SlashTypeaheadState, delta: number): SlashTypeaheadState {
  if (!state.active || state.suggestions.length === 0) return state;
  const next = (state.selectedIndex + delta + state.suggestions.length) % state.suggestions.length;
  return { ...state, selectedIndex: next };
}

export function dismissSlashTypeahead(state: SlashTypeaheadState): SlashTypeaheadState {
  return { ...state, active: false, suggestions: [], selectedIndex: -1 };
}

export function applySlashSelection(state: SlashTypeaheadState, key: 'tab' | 'enter'): SlashApplyAction {
  if (!state.active || state.selectedIndex < 0) return { action: 'none', input: state.input };
  const command = state.suggestions[state.selectedIndex]?.command || state.input;
  if (key === 'tab') return { action: 'complete', input: `${command} ` };
  return { action: 'execute', input: command };
}

export function sanitizePromptInsert(value: string): string {
  return value
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function takeVisibleEnd(value: string, maxWidth: number): string {
  if (visibleLength(value) <= maxWidth) return value;
  const ellipsis = '…';
  const ellipsisWidth = visibleLength(ellipsis);
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, Math.max(0, maxWidth));

  let width = ellipsisWidth;
  let output = '';
  for (const char of Array.from(value).reverse()) {
    const nextWidth = visibleLength(char);
    if (width + nextWidth > maxWidth) break;
    output = char + output;
    width += nextWidth;
  }
  return ellipsis + output;
}

function promptRedrawText(prompt: string): string {
  return prompt.replace(/^(?:\r?\n)+/, '');
}

function outputColumns(output: NodeJS.WriteStream): number {
  const columns = Number(output.columns || 0);
  return Number.isFinite(columns) && columns > 10 ? columns : 80;
}

export function formatPromptInputForDisplay(value: string, prompt: string, columns: number): string {
  const singleLineValue = sanitizePromptInsert(value);
  const maxInputWidth = Math.max(1, columns - visibleLength(promptRedrawText(prompt)));
  return takeVisibleEnd(singleLineValue, maxInputWidth);
}

export function renderSlashTypeahead(state: SlashTypeaheadState): string {
  if (!state.active) return '';
  const maxVisible = 5;
  const start = Math.max(0, Math.min(
    state.selectedIndex - Math.floor(maxVisible / 2),
    state.suggestions.length - maxVisible,
  ));
  const visible = state.suggestions.slice(start, start + maxVisible);
  return visible.map((item, index) => {
    const actualIndex = start + index;
    const selected = actualIndex === state.selectedIndex;
    const prefix = selected ? chalk.green(glyphs.pointer) : chalk.gray(' ');
    const aliasText = item.matchedAlias ? ` (${item.matchedAlias})` : '';
    const commandText = `${item.command}${aliasText}${item.argumentHint ? ` ${item.argumentHint}` : ''}`;
    const command = commandText.padEnd(state.commandWidth);
    const label = selected ? chalk.bold.white(command) : chalk.white(command);
    const source = item.loadedFrom ? chalk.gray(` [${item.loadedFrom}]`) : '';
    return `${prefix} ${label} ${chalk.gray(item.description)}${source}`;
  }).join('\n');
}

export function promptWithSlashTypeahead(options: SlashPromptOptions): Promise<string> {
  const input = options.input || process.stdin;
  const output = options.output || process.stdout;
  const redrawPrompt = promptRedrawText(options.prompt);
  const history = options.history || [];
  let historyIndex = history.length;
  let draft = '';
  let value = '';
  let state = createSlashTypeaheadState('', options.mode);
  let renderedSuggestionLines = 0;
  let settled = false;

  const clearSuggestions = () => {
    if (renderedSuggestionLines === 0) return;
    for (let i = 0; i < renderedSuggestionLines; i += 1) {
      output.write('\x1B[1B\r\x1B[2K');
    }
    output.write(`\x1B[${renderedSuggestionLines}A\r`);
    renderedSuggestionLines = 0;
  };

  const render = () => {
    clearSuggestions();
    const displayValue = formatPromptInputForDisplay(value, redrawPrompt, outputColumns(output));
    output.write(`\r\x1B[2K${redrawPrompt}${displayValue}`);
    const ghost = displayValue === value ? getMidInputSlashGhostText(value, value.length, options.mode) : null;
    if (ghost && !state.active) {
      output.write(chalk.gray(ghost.text));
      output.write(`\x1B[${ghost.text.length}D`);
    }
    const rendered = renderSlashTypeahead(state);
    if (rendered) {
      const lines = rendered.split('\n');
      output.write(`\n${rendered}`);
      renderedSuggestionLines = lines.length;
      output.write(`\x1B[${renderedSuggestionLines}A`);
      const cursorColumn = visibleLength(`${redrawPrompt}${displayValue}`);
      output.write(`\r${cursorColumn > 0 ? `\x1B[${cursorColumn}C` : ''}`);
    }
  };

  return new Promise((resolve) => {
    const wasRaw = input.isRaw;
    readline.emitKeypressEvents(input);
    input.setRawMode?.(true);
    input.resume();

    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearSuggestions();
      input.removeListener('keypress', onKeypress);
      options.signal?.removeEventListener('abort', onAbort);
      if (!wasRaw) input.setRawMode?.(false);
      options.onOverlayChange?.(false);
      output.write('\n');
    };

    const finish = (next: string) => {
      cleanup();
      resolve(next);
    };

    const onAbort = () => {
      finish('');
    };

    const refreshState = () => {
      const previousActive = state.active;
      state = createSlashTypeaheadState(value, options.mode);
      if (previousActive !== state.active) options.onOverlayChange?.(state.active);
    };

    const onKeypress = (str: string | undefined, key: readline.Key) => {
      // When the slash overlay is closed, Up/Down recall submitted-input history in place
      // (overlay-open Up/Down stays bound to suggestion selection below).
      if (!state.active && (key?.name === 'up' || key?.name === 'down')) {
        if (key.name === 'up') {
          if (historyIndex > 0) {
            if (historyIndex === history.length) draft = value;
            historyIndex -= 1;
            value = history[historyIndex] ?? '';
            refreshState();
            render();
          }
        } else if (historyIndex < history.length) {
          historyIndex += 1;
          value = historyIndex === history.length ? draft : (history[historyIndex] ?? '');
          refreshState();
          render();
        }
        return;
      }

      const overlayDismiss = resolveOverlayDismissKeyAction(str, key, state.active);
      if (overlayDismiss.action === 'dismiss-overlay') {
        state = dismissSlashTypeahead(state);
        options.onOverlayChange?.(false);
        render();
        return;
      }

      const keyAction = resolveSlashPromptKeyAction(str, key, state.active);
      switch (keyAction.action) {
        case 'dismiss-suggestions':
          state = dismissSlashTypeahead(state);
          options.onOverlayChange?.(false);
          render();
          return;
        case 'move-selection':
          state = moveSlashSelection(state, keyAction.delta);
          render();
          return;
        case 'complete-selection':
          {
            const applied = applySlashSelection(state, 'tab');
            if (applied.action === 'complete') value = applied.input;
            refreshState();
            render();
          }
          return;
        case 'complete-mid-input':
          {
            const applied = applyMidInputSlashCompletion(value, value.length, options.mode);
            if (applied) {
              value = applied.input;
              refreshState();
              render();
            }
          }
          return;
        case 'submit':
          if (state.active) {
            const applied = applySlashSelection(state, 'enter');
            finish(applied.input);
            return;
          }
          finish(value);
          return;
        case 'backspace':
          value = value.slice(0, -1);
          refreshState();
          render();
          return;
        case 'insert':
          value += sanitizePromptInsert(keyAction.value);
          refreshState();
          render();
          return;
        case 'none':
          return;
      }
    };

    output.write(options.prompt);
    if (options.signal?.aborted) {
      finish('');
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    input.on('keypress', onKeypress);
  });
}

/**
 * Build a unified suggestion list from slash commands and optional path/skill/model/agent sources.
 * Re-exported for use by the chat runtime and tests.
 */
export function getUnifiedSuggestions(
  mode: AiMode,
  opts?: {
    skills?: Array<{ id: string; name: string; description: string }>;
    models?: string[];
    agents?: Array<{ id: string; name: string; description: string }>;
    pathItems?: SuggestionItem[];
    maxResults?: number;
  },
): SuggestionItem[] {
  const items = getSlashMenuItems(mode);
  return collectUnifiedSuggestions({
    commands: items.map((item) => ({
      id: item.id,
      command: item.command,
      description: item.description,
      aliases: item.aliases,
      argumentHint: item.argumentHint,
      loadedFrom: item.loadedFrom,
    })),
    skills: opts?.skills,
    models: opts?.models,
    agents: opts?.agents,
    pathItems: opts?.pathItems,
    maxResults: opts?.maxResults,
  });
}

export { isPathLikeToken, getPathSuggestions };
export type { SuggestionItem };
export { collectUnifiedSuggestions, filterUnifiedSuggestions, createCommandSuggestion };
