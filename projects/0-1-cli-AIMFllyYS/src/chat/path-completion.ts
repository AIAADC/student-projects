/**
 * Path completion for the prompt input.
 *
 * Adapted from Claude Code src/utils/suggestions/directoryCompletion.ts —
 * ported as a provider-neutral module with workspace-root safety, Windows
 * path normalization, and UTF-8 Chinese file name support. No LRU cache
 * dependency (uses a simple Map); no vendor-managed service hooks.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { SuggestionItem } from './suggestions';

export interface PathEntry {
  name: string;
  fullPath: string;
  type: 'directory' | 'file';
}

export interface PathCompletionOptions {
  maxResults?: number;
  includeFiles?: boolean;
  includeHidden?: boolean;
}

interface ParsedPath {
  directory: string;
  prefix: string;
}

const DEFAULT_MAX_RESULTS = 20;
const SCAN_ENTRY_LIMIT = 200;

const dirCache = new Map<string, PathEntry[]>();

export function clearPathCache(): void {
  dirCache.clear();
}

export function normalizeToForwardSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Check whether `target` is inside `root` (inclusive).
 * Uses normalized, resolved absolute paths for comparison.
 */
export function isWithinWorkspace(target: string, root: string): boolean {
  const normalizedTarget = path.resolve(target).toLowerCase();
  const normalizedRoot = path.resolve(root).toLowerCase();
  if (normalizedTarget === normalizedRoot) return true;
  const rootPrefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep;
  return normalizedTarget.startsWith(rootPrefix);
}

/**
 * Parse a partial path string into directory + prefix.
 */
export function parsePartialPath(partialPath: string, workspaceRoot: string): ParsedPath {
  if (!partialPath) {
    return { directory: workspaceRoot, prefix: '' };
  }

  const resolved = path.resolve(workspaceRoot, partialPath);

  if (partialPath.endsWith('/') || partialPath.endsWith(path.sep)) {
    return { directory: resolved, prefix: '' };
  }

  return {
    directory: path.dirname(resolved),
    prefix: path.basename(partialPath),
  };
}

/**
 * Detect whether a token looks like a file-system path.
 * Must not match `/command` (slash commands start with / followed by alpha).
 */
export function isPathLikeToken(token: string): boolean {
  if (token.startsWith('./') || token.startsWith('../')) return true;
  if (token === '.' || token === '..') return true;
  if (/^[a-zA-Z][\w-]*\//.test(token)) return true;
  return false;
}

/**
 * Scan a directory for entries.  Results are cached in a simple Map.
 */
async function scanDirectory(
  dirPath: string,
  includeHidden: boolean,
): Promise<PathEntry[]> {
  const cacheKey = `${dirPath}:${includeHidden}`;
  const cached = dirCache.get(cacheKey);
  if (cached) return cached;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: PathEntry[] = entries
      .filter((e) => includeHidden || !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        fullPath: path.join(dirPath, e.name),
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
      }))
      .sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, SCAN_ENTRY_LIMIT);

    dirCache.set(cacheKey, result);
    if (dirCache.size > 200) {
      const firstKey = dirCache.keys().next().value;
      if (firstKey !== undefined) dirCache.delete(firstKey);
    }
    return result;
  } catch {
    return [];
  }
}

/**
 * Return path-based SuggestionItems for the given partial path,
 * scoped to the workspace root.
 */
export async function getPathSuggestions(
  partialPath: string,
  workspaceRoot: string,
  options: PathCompletionOptions = {},
): Promise<SuggestionItem[]> {
  const {
    maxResults = DEFAULT_MAX_RESULTS,
    includeFiles = true,
    includeHidden = false,
  } = options;

  const { directory, prefix } = parsePartialPath(partialPath, workspaceRoot);

  if (!isWithinWorkspace(directory, workspaceRoot)) {
    return [];
  }

  const entries = await scanDirectory(directory, includeHidden);
  const prefixLower = prefix.toLowerCase();

  const matches = entries
    .filter((e) => {
      if (!includeFiles && e.type === 'file') return false;
      return e.name.toLowerCase().startsWith(prefixLower);
    })
    .slice(0, maxResults);

  const hasSeparator = partialPath.includes('/') || partialPath.includes(path.sep);
  let dirPortion = '';
  if (hasSeparator) {
    const lastSlash = partialPath.lastIndexOf('/');
    const lastSep = partialPath.lastIndexOf(path.sep);
    const lastSeparatorPos = Math.max(lastSlash, lastSep);
    dirPortion = partialPath.substring(0, lastSeparatorPos + 1);
  }
  if (dirPortion.startsWith('./') || dirPortion.startsWith('.' + path.sep)) {
    dirPortion = dirPortion.slice(2);
  }

  return matches.map((entry) => {
    const display = dirPortion + entry.name;
    return {
      id: `path:${normalizeToForwardSlash(display)}${entry.type === 'directory' ? '/' : ''}`,
      displayText: entry.type === 'directory' ? `${display}/` : display,
      description: entry.type,
      source: 'path' as const,
    };
  });
}
