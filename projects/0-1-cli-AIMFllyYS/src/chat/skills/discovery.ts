import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildRuntimeSkillFromPreview } from './frontmatter';
import {
  DiscoverRuntimeSkillsOptions,
  METADATA_READ_BYTES,
  readTextPrefix,
  RuntimeSkill,
  skillIdFromPath,
} from './runtime';

const MAX_DISCOVERY_DEPTH = 4;

export function getDefaultSkillRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const home = env.USERPROFILE || env.HOME || os.homedir();
  const configured = (env.HI_SKILLS_PATH || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);

  return [
    ...configured,
    path.join(process.cwd(), '.0-1-cli', 'skills'),
    path.join(process.cwd(), 'skills'),
    path.join(home, '.0-1-cli', 'skills'),
    path.join(home, '.codex', 'skills'),
    path.join(home, '.claude', 'skills'),
  ];
}

function candidateSkillDirs(root: string, maxDepth = MAX_DISCOVERY_DEPTH): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isDirectory() && fs.existsSync(path.join(root, 'SKILL.md'))) return [root];
  if (!stat.isDirectory()) return [];

  const found: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (fs.existsSync(path.join(child, 'SKILL.md'))) {
        found.push(child);
        continue;
      }
      visit(child, depth + 1);
    }
  };
  visit(root, 1);
  return found;
}

export function discoverRuntimeSkills(options: DiscoverRuntimeSkillsOptions = {}): RuntimeSkill[] {
  const roots = options.roots || getDefaultSkillRoots(options.env);
  const seen = new Set<string>();
  const skills: RuntimeSkill[] = [];

  for (const root of roots) {
    for (const dir of candidateSkillDirs(root)) {
      const id = skillIdFromPath(dir);
      if (seen.has(id)) continue;
      seen.add(id);
      const preview = readTextPrefix(path.join(dir, 'SKILL.md'), METADATA_READ_BYTES);
      if (!preview) continue;
      skills.push(buildRuntimeSkillFromPreview(preview.content, dir));
    }
  }

  return skills;
}
