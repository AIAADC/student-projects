import * as path from 'path';
import { SkillPackage } from './types';

const home = process.env.USERPROFILE || process.env.HOME || '.';

export const SKILL_MARKETPLACE: SkillPackage[] = [
  {
    key: 'superpowers',
    displayName: 'Official Superpowers',
    description: '官方工作流技能包：教 AI 先计划、先写测试、再实现、再复盘，适合把一次需求拆成稳定步骤。',
    sourceUrl: 'https://github.com/openai/superpowers',
    sourceType: 'local',
    sourcePath: path.join(home, '.codex', 'plugins', 'cache', 'openai-curated', 'superpowers', 'c6ea566d', 'skills'),
  },
  {
    key: 'agent-onboarding',
    displayName: 'Agent Onboarding Skill',
    description: '树成林 AI-IP 社群新手入门技能：用真实小任务带你理解 Agent、提问、实践和迭代。',
    sourceUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill',
    sourceType: 'git',
    repoUrl: 'https://github.com/kaijie0074-art/agent-onboarding-skill.git',
  },
];
