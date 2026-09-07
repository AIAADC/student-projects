import * as fs from 'fs';
import * as path from 'path';
import { isDangerousPath } from '../permissions/engine';

export interface ReadFileToolInput {
  path: string;
  workspaceRoot: string;
  maxLines?: number;
}

export interface ListFilesToolInput {
  path?: string;
  workspaceRoot: string;
}

export interface SearchFilesToolInput {
  pattern: string;
  workspaceRoot: string;
  path?: string;
  maxResults?: number;
}

function resolveInsideWorkspace(workspaceRoot: string, targetPath?: string): { ok: true; path: string } | { ok: false; error: string } {
  const resolved = path.resolve(workspaceRoot, targetPath || '.');
  try {
    const realRoot = fs.realpathSync(workspaceRoot);
    const realTarget = fs.realpathSync(resolved);
    if (isDangerousPath(realRoot, realTarget)) return { ok: false, error: 'Error: path outside workspace' };
    return { ok: true, path: realTarget };
  } catch (error: any) {
    if (isDangerousPath(workspaceRoot, resolved)) return { ok: false, error: 'Error: path outside workspace' };
    return { ok: false, error: 'Error: ' + error.message };
  }
}

export function listFilesTool(input: ListFilesToolInput): string {
  const resolved = resolveInsideWorkspace(input.workspaceRoot, input.path);
  if (!resolved.ok) return resolved.error;
  try {
    const entries = fs.readdirSync(resolved.path, { withFileTypes: true });
    return entries.map((entry) => `${entry.isDirectory() ? '[DIR] ' : '      '}${entry.name}`).join('\n') || '(empty directory)';
  } catch (error: any) {
    return 'Error: ' + error.message;
  }
}

export function readFileTool(input: ReadFileToolInput): string {
  const resolved = resolveInsideWorkspace(input.workspaceRoot, input.path);
  if (!resolved.ok) return resolved.error;
  try {
    const content = fs.readFileSync(resolved.path, 'utf8');
    const lines = content.split(/\r?\n/);
    const maxLines = input.maxLines ?? 200;
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (truncated, showing first ${maxLines} lines)`;
    }
    return content;
  } catch (error: any) {
    return 'Error: ' + error.message;
  }
}

function walkFiles(root: string, workspaceRoot: string, files: string[] = []): string[] {
  const stats = fs.lstatSync(root);
  if (stats.isSymbolicLink() || isDangerousPath(workspaceRoot, root)) {
    return files;
  }
  if (stats.isFile()) {
    files.push(root);
    return files;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') walkFiles(fullPath, workspaceRoot, files);
    } else {
      if (!isDangerousPath(workspaceRoot, fullPath)) files.push(fullPath);
    }
  }
  return files;
}

export function searchFilesTool(input: SearchFilesToolInput): string {
  const resolved = resolveInsideWorkspace(input.workspaceRoot, input.path);
  if (!resolved.ok) return resolved.error;
  const maxResults = input.maxResults ?? 50;
  const matches: string[] = [];
  for (const file of walkFiles(resolved.path, input.workspaceRoot)) {
    if (matches.length >= maxResults) break;
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (matches.length < maxResults && line.includes(input.pattern)) {
        matches.push(`${path.relative(input.workspaceRoot, file)}:${index + 1}: ${line}`);
      }
    });
  }
  return matches.join('\n') || '(no matches)';
}
