import * as fs from 'fs';
import * as path from 'path';
import { isDangerousPath, PermissionDecision, resolveWorkspacePath } from '../permissions/engine';

export type FileChangeOperation = 'create' | 'overwrite' | 'edit';

export interface FileChangeSummary {
  operation: FileChangeOperation;
  filePath: string;
  added: number;
  removed: number;
  changed: number;
}

export function computeFileChangeSummary(input: {
  targetPath: string;
  newContent: string;
  workspaceRoot: string;
  oldString?: string;
  newString?: string;
}): FileChangeSummary {
  const resolvedPath = path.isAbsolute(input.targetPath)
    ? input.targetPath
    : resolveWorkspacePath(input.workspaceRoot, input.targetPath);
  const relativePath = path.relative(input.workspaceRoot, resolvedPath);

  let oldContent = '';
  let fileExists = false;
  try {
    oldContent = fs.readFileSync(resolvedPath, 'utf8');
    fileExists = true;
  } catch { /* file does not exist */ }

  if (!fileExists) {
    const newLines = input.newContent.split('\n');
    return {
      operation: 'create',
      filePath: relativePath,
      added: newLines.length,
      removed: 0,
      changed: 0,
    };
  }

  const operation: FileChangeOperation = (input.oldString != null) ? 'edit' : 'overwrite';
  const oldLines = oldContent.split('\n');
  const newLines = input.newContent.split('\n');

  let added = 0;
  let removed = 0;
  let changed = 0;
  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length) {
      added++;
    } else if (i >= newLines.length) {
      removed++;
    } else if (oldLines[i] !== newLines[i]) {
      changed++;
    }
  }

  return { operation, filePath: relativePath, added, removed, changed };
}

export function writeFileTool(input: {
  path: string;
  content: string;
  workspaceRoot: string;
  permissionDecision?: PermissionDecision;
}): string {
  if (input.permissionDecision?.decision !== 'allow') return 'Error: permission required';
  const resolved = resolveWorkspacePath(input.workspaceRoot, input.path);
  if (isDangerousPath(input.workspaceRoot, resolved)) return 'Error: path outside workspace';
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, input.content, 'utf8');
  return 'OK';
}
