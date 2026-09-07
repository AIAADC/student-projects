import chalk from 'chalk';
import { installSkillToTargets } from './installer';
import { selectSkillInstall } from './menu';
import { SKILL_MARKETPLACE } from './registry';
import { getSkillTargets } from './targets';

export { getSkillTargets, SKILL_MARKETPLACE };

export async function handleSkills(): Promise<void> {
  const selection = await selectSkillInstall();
  if (!selection) return;

  try {
    await installSkillToTargets(selection.skill, selection.targets);
  } catch (error: any) {
    console.log(chalk.red(`安装失败: ${error.message}`));
  }
}