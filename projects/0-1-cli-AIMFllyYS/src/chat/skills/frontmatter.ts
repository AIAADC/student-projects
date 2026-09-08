import * as path from 'path';
import { RuntimeSkill, skillIdFromPath } from './runtime';

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  whenToUse?: string;
  version?: string;
}

const FRONTMATTER_FIELD = /^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/;

function splitFrontmatter(preview: string): { frontmatter: string; body: string } {
  const trimmed = preview.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('---')) {
    return { frontmatter: '', body: trimmed };
  }

  const closing = trimmed.indexOf('\n---', 3);
  if (closing === -1) {
    return { frontmatter: '', body: trimmed };
  }

  return {
    frontmatter: trimmed.slice(3, closing).trim(),
    body: trimmed.slice(closing + 4).replace(/^\r?\n/, ''),
  };
}

function parseSimpleFrontmatter(frontmatter: string): SkillFrontmatter {
  const parsed: SkillFrontmatter = {};

  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(FRONTMATTER_FIELD);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^['"]|['"]$/g, '');
    if (key === 'name') parsed.name = value;
    if (key === 'description') parsed.description = value;
    if (key === 'when_to_use' || key === 'when-to-use') parsed.whenToUse = value;
    if (key === 'version') parsed.version = value;
  }

  return parsed;
}

function firstBodyDescription(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('#') && !/^description\s*:/i.test(line))
    || '';
}

export function parseSkillFrontmatter(preview: string): SkillFrontmatter {
  const { frontmatter, body } = splitFrontmatter(preview);
  const parsed = frontmatter ? parseSimpleFrontmatter(frontmatter) : {};

  if (!parsed.name) {
    parsed.name = preview.match(/^name\s*:\s*(.+)$/im)?.[1]?.trim()
      || preview.match(/^#\s+(.+)$/m)?.[1]?.trim();
  }

  if (!parsed.description) {
    parsed.description = preview.match(/^description\s*:\s*(.+)$/im)?.[1]?.trim()
      || firstBodyDescription(body);
  }

  if (!parsed.whenToUse) {
    const inlineTrigger = preview.match(/^when_to_use\s*:\s*(.+)$/im)?.[1]?.trim()
      || preview.match(/^when-to-use\s*:\s*(.+)$/im)?.[1]?.trim();
    if (inlineTrigger) parsed.whenToUse = inlineTrigger;
  }

  return parsed;
}

export function buildRuntimeSkillFromPreview(preview: string, skillPath: string): RuntimeSkill {
  const frontmatter = parseSkillFrontmatter(preview);
  const skillFile = path.join(skillPath, 'SKILL.md');

  return {
    id: skillIdFromPath(skillPath),
    name: frontmatter.name || path.basename(skillPath),
    description: frontmatter.description || '',
    ...(frontmatter.whenToUse ? { whenToUse: frontmatter.whenToUse } : {}),
    path: skillPath,
    skillFile,
  };
}
