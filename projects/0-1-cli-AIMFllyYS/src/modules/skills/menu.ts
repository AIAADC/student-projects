import * as readline from 'readline';
import chalk from 'chalk';
import { interactiveSelect } from '../../utils/selector';
import { SKILL_MARKETPLACE } from './registry';
import { getSkillTargets } from './targets';
import { SkillPackage, SkillTarget } from './types';

async function selectSkill(): Promise<SkillPackage | null> {
  let selected: SkillPackage | null = null;
  await interactiveSelect({
    title: '选择要安装的 skill',
    options: SKILL_MARKETPLACE.map((skill) => ({
      label: skill.displayName,
      value: skill.key,
      description: skill.description,
    })),
    onSelect: (value) => {
      selected = SKILL_MARKETPLACE.find((skill) => skill.key === value) || null;
    },
  });
  return selected;
}

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function selectTargets(): Promise<SkillTarget[]> {
  const targets = getSkillTargets();
  console.log(chalk.bold.cyan('\n选择安装目标：可输入序号，用英文逗号分隔。直接回车会安装到 Global。'));
  targets.forEach((target, index) => {
    const status = target.detected ? '已存在' : '将自动创建';
    console.log(chalk.gray(`${index + 1}. ${target.displayName} - ${target.path} (${status})`));
  });

  const answer = (await ask('安装目标: ')).trim();
  if (!answer) return targets.filter((target) => target.key === 'global');

  const selected = new Set(answer.split(',').map((part) => Number(part.trim()) - 1));
  return targets.filter((_, index) => selected.has(index));
}

export async function selectSkillInstall(): Promise<{ skill: SkillPackage; targets: SkillTarget[] } | null> {
  const skill = await selectSkill();
  if (!skill) return null;
  const targets = await selectTargets();
  if (targets.length === 0) {
    console.log(chalk.yellow('未选择安装目标。'));
    return null;
  }
  return { skill, targets };
}