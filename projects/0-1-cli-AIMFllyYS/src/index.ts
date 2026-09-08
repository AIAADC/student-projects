#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as v8 from 'v8';
import { exec } from 'child_process';

// Limit memory footprint to avoid impacting other apps
v8.setFlagsFromString('--max-old-space-size=64');

// Lower process priority on Windows so CLI never hogs CPU
if (process.platform === 'win32') {
  exec(`wmic process where processid=${process.pid} CALL setpriority "below normal"`, { windowsHide: true });
}

// Load .env from project root (not cwd)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { displayAccounts, interactiveSwitch, getGitHubInfo } from './modules/github';
import { getProjectPaths, ensureProjectRoot } from './modules/paths';
import { getCliCommands, getCliByTool } from './modules/cli';
import { getApps } from './modules/apps';
import { startChat } from './chat';
import { runClear } from './modules/clear';
import { handleInstall, parseInstallArgs } from './modules/install';
import { handleSkills } from './modules/skills';
import { runStatePage } from './modules/state';
import { handleGuide } from './modules/guide';
import { handleApiGuide } from './modules/api';
import { handlePayGuide } from './modules/pay';

const program = new Command();
const VERSION = '0.7.0';

function renderChineseHelp(): string {
  return [
    '用法：hi [选项]',
    '',
    '0-1 CLI - 新人 AI CLI 入门与本地开发工具箱',
    '',
    '选项：',
    '  -V, --version             显示版本号',
    '  -h, --help                显示帮助信息',
    '  -s, --short               简短输出关键信息',
    '  --state                   显示 GitHub、项目路径、CLI 指令和应用状态页',
    '  --paths                   只显示项目路径',
    '  --apps                    只显示常用应用启动命令',
    '  --api                     打开模型 API 平台导航',
    '  --pay                     打开支付、虚拟卡、代充和中转资源导航',
    '  -g, --gh                  显示 GitHub 账号和 Issues',
    '  --gh-accounts             只显示 GitHub 账号',
    '  --gh-switch               交互式切换 GitHub 账号',
    '  --gh-issues               只显示 GitHub Issues',
    '  -c, --cli <tool>          显示 AI CLI 指令参考（cc/kiro/codex/gemini/cursor/all）',
    '  -t, --task <description>  为 CLI 指令生成附带任务描述',
    '  -C, --chat                启动 AI 对话模式',
    '  -A, --ai                  启动 AI 对话模式（--chat 别名）',
    '  -m, --model <model>       指定 AI 模型（默认 deepseek-chat）',
    '  --auto-accept             AI Agent 自动接受权限确认',
    '  --install [tool]          安装 AI CLI、AI IDE 或环境工具',
    '  --skills                  打开 skills 市场',
    '  --clear                   启用清理模式',
    '  -p, --process             清理无用后台进程（需配合 --clear）',
    '  -d, --drive               清理 C 盘硬盘空间（需配合 --clear）',
    '  -a, --all                 同时清理进程和硬盘空间（需配合 --clear）',
    '  --clear-a                 快捷方式：同时清理进程和硬盘空间',
    '',
    '默认：只输入 hi 会打开新手讲解模式。',
    '',
  ].join('\n');
}

program
  .name('hi')
  .description('0-1 CLI - 新人 AI CLI 入门与本地开发工具箱')
  .usage('[选项]')
  .version(VERSION, '-V, --version', '显示版本号')
  .helpOption('-h, --help', '显示帮助信息')
  .configureHelp({ formatHelp: () => renderChineseHelp() })
  .allowUnknownOption(true)
  // Basic info options
  .option('-s, --short', '简短输出关键信息')
  .option('--state', '显示 GitHub、项目路径、CLI 指令和应用状态页')
  .option('--paths', '只显示项目路径')
  .option('--apps', '只显示常用应用启动命令')
  .option('--api', '打开模型 API 平台导航')
  .option('--pay', '打开支付、虚拟卡、代充和中转资源导航')
  // GitHub options
  .option('-g, --gh', '显示 GitHub 账号和 Issues')
  .option('--gh-accounts', '只显示 GitHub 账号')
  .option('--gh-switch', '交互式切换 GitHub 账号')
  .option('--gh-issues', '只显示 GitHub Issues')
  // CLI reference options
  .option('-c, --cli <tool>', '显示 AI CLI 指令参考（cc/kiro/codex/gemini/cursor/all）')
  .option('-t, --task <description>', '为 CLI 指令生成附带任务描述')
  // AI chat options
  .option('-C, --chat', '启动 AI 对话模式')
  .option('-A, --ai', '启动 AI 对话模式（--chat 别名）')
  .option('-m, --model <model>', '指定 AI 模型（默认 deepseek-chat）')
  .option('--auto-accept', 'AI Agent 自动接受权限确认')
  // Installer options
  .option('--install [tool]', '安装 AI CLI、AI IDE 或环境工具')
  .option('--skills', '打开 skills 市场')
  // Cleanup options
  .option('--clear', '启用清理模式')
  .option('-p, --process', '清理无用后台进程（需配合 --clear）')
  .option('-d, --drive', '清理 C 盘硬盘空间（需配合 --clear）')
  .option('-a, --all', '同时清理进程和硬盘空间（需配合 --clear）')
  .option('--clear-a', '快捷方式：同时清理进程和硬盘空间')
  .action(async (opts) => {
    const rawArgs = process.argv.slice(2);

    if (opts.install !== undefined) {
      await handleInstall(parseInstallArgs(rawArgs));
      return;
    }
    if (opts.skills) {
      await handleSkills();
      return;
    }
    if (opts.state) {
      await runStatePage(opts.task, VERSION);
      return;
    }
    if (opts.api) {
      await handleApiGuide();
      return;
    }
    if (opts.pay) {
      await handlePayGuide();
      return;
    }

    // Clear: unified cleanup entry
    if (opts.clearA || (opts.clear && opts.all)) {
      await runClear('all');
      return;
    }
    if (opts.clear && opts.process) {
      await runClear('process');
      return;
    }
    if (opts.clear && opts.drive) {
      await runClear('drive');
      return;
    }
    if (opts.clear) {
      await runClear('all');
      return;
    }

    // AI Chat mode (takes priority)
    if (opts.chat || opts.ai) {
      await startChat({ modelId: opts.model, autoAccept: Boolean(opts.autoAccept) });
      return;
    }

    // GitHub profile switcher
    if (opts.ghSwitch) {
      await interactiveSwitch();
      return;
    }

    // GitHub accounts only
    if (opts.ghAccounts) {
      displayAccounts();
      return;
    }

    // GitHub issues only
    if (opts.ghIssues) {
      await getGitHubInfo({ showAccounts: false, showIssues: true });
      return;
    }

    // GitHub full info
    if (opts.gh) {
      console.log(chalk.bold.cyan('\n=== GitHub Status ===\n'));
      await getGitHubInfo({ showAccounts: true, showIssues: true });
      return;
    }

    // CLI reference
    if (opts.cli) {
      const toolMap: Record<string, string> = {
        '-cc': 'claude', 'cc': 'claude',
        '-kiro': 'kiro', 'kiro': 'kiro',
        '-codex': 'codex', 'codex': 'codex',
        '-gemini': 'gemini', 'gemini': 'gemini',
        '-cursor': 'cursor', 'cursor': 'cursor',
      };
      const tool = toolMap[opts.cli] || opts.cli;
      if (tool === 'all') {
        console.log(chalk.bold('\n=== CLI Auto Commands ===\n'));
        console.log(getCliCommands(opts.task));
      } else {
        console.log(chalk.bold(`\n=== ${tool.toUpperCase()} CLI ===\n`));
        console.log(getCliByTool(tool, opts.task));
      }
      return;
    }

    // Project paths only
    if (opts.paths) {
      const root = await ensureProjectRoot();
      console.log(chalk.bold('\nProject Paths\n'));
      console.log(getProjectPaths(root));
      return;
    }

    // Apps only
    if (opts.apps) {
      console.log(chalk.bold('\nApp Launch Commands\n'));
      console.log(getApps());
      return;
    }

    if (rawArgs.length > 0) {
      program.outputHelp();
      return;
    }

    await handleGuide(VERSION);
  });

program.parse(process.argv);
