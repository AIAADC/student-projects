import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface DesktopSkillPackage {
  key: string;
  displayName: string;
  description: string;
  sourceUrl: string;
  sourceType: 'local' | 'git';
  sourcePath?: string;
  repoUrl?: string;
}

export interface DesktopSkillTarget {
  key: string;
  displayName: string;
  path: string;
  detected: boolean;
}

export interface DesktopSkillCatalog {
  packages: DesktopSkillPackage[];
  targets: DesktopSkillTarget[];
}

export interface DesktopSkillInstallRequest {
  skillKey: string;
  targetKeys: string[];
  confirm?: boolean;
}

export interface DesktopSkillInstallResult {
  ok: boolean;
  output: string;
  requiresConfirmation?: boolean;
}

const home = process.env.USERPROFILE || process.env.HOME || '.';

const DESKTOP_SKILL_PACKAGES: DesktopSkillPackage[] = [
  {
    key: 'superpowers',
    displayName: 'Official Superpowers',
    description: 'Workflow skills for planning, TDD, verification, and implementation discipline.',
    sourceUrl: 'https://github.com/openai/superpowers',
    sourceType: 'local',
    sourcePath: path.join(home, '.codex', 'plugins', 'cache', 'openai-curated', 'superpowers', 'c6ea566d', 'skills'),
  },
  {
    key: 'agent-onboarding',
    displayName: 'Agent Onboarding Skill',
    description: 'A beginner-friendly skill pack for learning agent workflows through real tasks.',
    sourceUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill',
    sourceType: 'git',
    repoUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill.git',
  },
];

function target(key: string, displayName: string, parts: string[]): DesktopSkillTarget {
  const targetPath = path.join(home, ...parts);
  return {
    key,
    displayName,
    path: targetPath,
    detected: fs.existsSync(path.dirname(targetPath)) || key === 'global',
  };
}

function getDesktopSkillTargets(): DesktopSkillTarget[] {
  return [
    target('claude', 'Claude Code', ['.claude', 'skills']),
    target('codex', 'Codex', ['.codex', 'skills']),
    target('cursor', 'Cursor', ['.cursor', 'skills']),
    target('global', 'Global 0-1 CLI skills', ['.0-1-cli', 'skills']),
  ];
}

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function installSkill(skill: DesktopSkillPackage, target: DesktopSkillTarget): void {
  fs.mkdirSync(target.path, { recursive: true });
  const destination = path.join(target.path, skill.key);
  if (skill.sourceType === 'local') {
    if (!skill.sourcePath || !fs.existsSync(skill.sourcePath)) {
      throw new Error(`Local source not found: ${skill.sourcePath || skill.sourceUrl}`);
    }
    copyDirectory(skill.sourcePath, destination);
    return;
  }
  if (!skill.repoUrl) throw new Error(`Missing repo URL for ${skill.key}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `hi-skill-${skill.key}-`));
  execFileSync('git', ['clone', '--depth', '1', skill.repoUrl, tempRoot], { stdio: 'ignore' });
  copyDirectory(tempRoot, destination);
}

export function listDesktopSkillCatalog(): DesktopSkillCatalog {
  return {
    packages: DESKTOP_SKILL_PACKAGES.map(({ sourcePath, repoUrl, ...item }) => item),
    targets: getDesktopSkillTargets(),
  };
}

export async function installDesktopSkillPackage(request: DesktopSkillInstallRequest): Promise<DesktopSkillInstallResult> {
  const skill = DESKTOP_SKILL_PACKAGES.find((item) => item.key === request.skillKey);
  if (!skill) return { ok: false, output: `Unknown skill package: ${request.skillKey}` };

  const targets = getDesktopSkillTargets().filter((target) => request.targetKeys.includes(target.key));
  if (targets.length === 0) return { ok: false, output: 'Choose at least one skill target.' };

  if (request.confirm !== true) {
    return {
      ok: false,
      requiresConfirmation: true,
      output: `Confirm before installing ${skill.displayName} to ${targets.length} target(s).`,
    };
  }

  for (const targetItem of targets) {
    installSkill(skill, targetItem);
  }
  return {
    ok: true,
    output: `Installed ${skill.displayName} to ${targets.map((targetItem) => targetItem.displayName).join(', ')}.`,
  };
}
