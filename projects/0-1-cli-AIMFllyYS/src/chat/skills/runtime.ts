import * as fs from 'fs';
import * as path from 'path';

export interface RuntimeSkill {
  id: string;
  name: string;
  description: string;
  whenToUse?: string;
  path: string;
  skillFile: string;
}

export interface ActiveRuntimeSkill extends RuntimeSkill {
  content: string;
  truncated: boolean;
}

export interface DiscoverRuntimeSkillsOptions {
  roots?: string[];
  env?: NodeJS.ProcessEnv;
}

export const METADATA_READ_BYTES = 16 * 1024;
export const DEFAULT_PROMPT_CHARS_PER_SKILL = 6000;

export function skillIdFromPath(skillPath: string): string {
  return path.basename(skillPath).trim().toLowerCase();
}

export function readTextPrefix(file: string, maxBytes: number): { content: string; truncated: boolean } | undefined {
  try {
    const stats = fs.statSync(file);
    const length = Math.min(stats.size, maxBytes);
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
      const content = buffer.toString('utf8', 0, bytesRead).replace(/\uFFFD+$/g, '');
      return { content, truncated: stats.size > bytesRead };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return undefined;
  }
}

export function loadRuntimeSkillContent(
  skill: RuntimeSkill,
  options: { maxChars?: number } = {}
): ActiveRuntimeSkill {
  const maxChars = options.maxChars ?? DEFAULT_PROMPT_CHARS_PER_SKILL;
  const maxBytes = Math.max(32 * 1024, maxChars * 4 + 1024);
  const loaded = readTextPrefix(skill.skillFile, maxBytes);
  if (!loaded) {
    return { ...skill, content: `Unable to read ${skill.skillFile}`, truncated: false };
  }
  return {
    ...skill,
    content: loaded.content.slice(0, maxChars),
    truncated: loaded.truncated || loaded.content.length > maxChars,
  };
}
