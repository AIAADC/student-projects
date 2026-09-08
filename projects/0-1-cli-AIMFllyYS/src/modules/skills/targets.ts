import * as fs from 'fs';
import * as path from 'path';
import { SkillTarget } from './types';

const home = process.env.USERPROFILE || process.env.HOME || '.';

function target(key: string, displayName: string, parts: string[]): SkillTarget {
  const targetPath = path.join(home, ...parts);
  return {
    key,
    displayName,
    path: targetPath,
    detected: fs.existsSync(path.dirname(targetPath)) || key === 'global',
  };
}

export function getSkillTargets(): SkillTarget[] {
  return [
    target('claude', 'Claude Code', ['.claude', 'skills']),
    target('codex', 'Codex', ['.codex', 'skills']),
    target('cursor', 'Cursor', ['.cursor', 'skills']),
    target('global', 'Global 0-1 CLI skills', ['.0-1-cli', 'skills']),
  ];
}
