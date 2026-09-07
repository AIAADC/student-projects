import chalk from 'chalk';
import { interactiveSelect } from '../../utils/selector';
import { CLI_INSTALL_TARGETS, ENV_INSTALL_TARGETS, IDE_INSTALL_TARGETS } from './registry';
import { InstallTarget } from './types';

async function selectTarget(title: string, targets: InstallTarget[]): Promise<InstallTarget | null> {
  let selected: InstallTarget | null = null;
  await interactiveSelect({
    title,
    options: targets.map((target) => ({
      label: target.displayName,
      value: target.key,
      description: target.description,
    })),
    onSelect: (value) => {
      selected = targets.find((target) => target.key === value) || null;
    },
  });
  return selected;
}

export async function selectInstallTarget(): Promise<InstallTarget | null> {
  let category = '';
  await interactiveSelect({
    title: '选择安装类型',
    options: [
      { label: '下载 AI CLI 工具', value: 'cli', description: 'Claude Code、Kimi、Codex、Kiro 等命令行 AI 助手' },
      { label: 'AI IDE 编辑器', value: 'ide', description: 'VS Code、Cursor、TRAE、Qoder 等开发环境' },
      { label: '魔法环境工具', value: 'environment', description: '代理环境、Clash Verge、CC Switch、虚拟卡、指纹浏览器' },
    ],
    onSelect: (value) => {
      category = value;
    },
    onCancel: () => {
      console.log(chalk.yellow('已取消安装。'));
    },
  });

  if (category === 'cli') return selectTarget('选择 AI CLI 工具', CLI_INSTALL_TARGETS);
  if (category === 'ide') return selectTarget('选择 AI IDE 编辑器', IDE_INSTALL_TARGETS);
  if (category === 'environment') return selectTarget('选择魔法环境工具', ENV_INSTALL_TARGETS);
  return null;
}