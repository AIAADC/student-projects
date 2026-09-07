import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import chalk from 'chalk';
import { SkillPackage, SkillTarget } from './types';

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(source, destination, { recursive: true, force: true });
}

function installFromGit(skill: SkillPackage, target: SkillTarget): void {
  if (!skill.repoUrl) throw new Error(`Missing repo URL for ${skill.key}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `hi-skill-${skill.key}-`));
  execSync(`git clone --depth 1 "${skill.repoUrl}" "${tempRoot}"`, { stdio: 'inherit' });
  copyDirectory(tempRoot, path.join(target.path, skill.key));
}

function installFromLocal(skill: SkillPackage, target: SkillTarget): void {
  if (!skill.sourcePath || !fs.existsSync(skill.sourcePath)) {
    throw new Error(`Local source not found: ${skill.sourcePath || skill.sourceUrl}`);
  }
  copyDirectory(skill.sourcePath, path.join(target.path, skill.key));
}

export async function installSkillToTargets(skill: SkillPackage, targets: SkillTarget[]): Promise<void> {
  for (const target of targets) {
    console.log(chalk.cyan(`正在安装 ${skill.displayName} -> ${target.displayName}`));
    fs.mkdirSync(target.path, { recursive: true });
    if (skill.sourceType === 'git') {
      installFromGit(skill, target);
    } else {
      installFromLocal(skill, target);
    }
    console.log(chalk.green(`安装完成: ${target.path}`));
  }
}