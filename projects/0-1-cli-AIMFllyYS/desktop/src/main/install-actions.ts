import { spawn } from 'child_process';
import { shell } from 'electron';

export type DesktopInstallCategory = 'cli' | 'ide' | 'environment';

export interface DesktopInstallTarget {
  key: string;
  displayName: string;
  category: DesktopInstallCategory;
  description: string;
  sourceUrl: string;
  installUrl?: string;
  commands?: DesktopInstallCommand[];
  updateCommand?: string;
  opensUrlOnly?: boolean;
  requiresConfirmation: true;
}

type DesktopInstallPlatform = NodeJS.Platform | 'all';

interface DesktopInstallCommand {
  platform: DesktopInstallPlatform;
  command: string;
}

export interface DesktopInstallRunRequest {
  key: string;
  latest?: boolean;
  confirm?: boolean;
}

export interface DesktopInstallRunResult {
  ok: boolean;
  output: string;
  requiresConfirmation?: boolean;
}

const DESKTOP_INSTALL_TARGETS: DesktopInstallTarget[] = [
  {
    key: 'cc',
    displayName: 'Claude Code',
    category: 'cli',
    description: 'Anthropic Claude Code CLI.',
    sourceUrl: 'https://code.claude.com/docs/en/overview',
    updateCommand: 'claude update',
    commands: [
      { platform: 'win32', command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"' },
      { platform: 'all', command: 'curl -fsSL https://claude.ai/install.sh | bash' },
    ],
    requiresConfirmation: true,
  },
  {
    key: 'codex',
    displayName: 'OpenAI Codex CLI',
    category: 'cli',
    description: 'OpenAI command line coding agent.',
    sourceUrl: 'https://developers.openai.com/codex/cli',
    updateCommand: 'npm install -g @openai/codex@latest',
    commands: [
      { platform: 'win32', command: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://chatgpt.com/codex/install.ps1 | iex"' },
      { platform: 'all', command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh' },
    ],
    requiresConfirmation: true,
  },
  {
    key: 'kimi',
    displayName: 'Kimi Code',
    category: 'cli',
    description: 'Moonshot AI Kimi Code CLI.',
    sourceUrl: 'https://platform.moonshot.ai/docs/guide/kimi-cli-support',
    updateCommand: 'kimi upgrade',
    commands: [{ platform: 'all', command: 'npm install -g @moonshot-ai/kimi-code@latest' }],
    requiresConfirmation: true,
  },
  {
    key: 'vscode',
    displayName: 'Visual Studio Code',
    category: 'ide',
    description: 'Microsoft VS Code download page.',
    sourceUrl: 'https://code.visualstudio.com/download',
    installUrl: 'https://code.visualstudio.com/download',
    opensUrlOnly: true,
    requiresConfirmation: true,
  },
  {
    key: 'cursor',
    displayName: 'Cursor',
    category: 'ide',
    description: 'Cursor AI editor download page.',
    sourceUrl: 'https://cursor.com/download',
    installUrl: 'https://cursor.com/download',
    opensUrlOnly: true,
    requiresConfirmation: true,
  },
  {
    key: 'clash-verge',
    displayName: 'Clash Verge - Windows',
    category: 'environment',
    description: 'Windows proxy client download.',
    sourceUrl: 'https://www.sibker.com/client/Clash.Verge_2.4.7_x64-setup.exe',
    installUrl: 'https://www.sibker.com/client/Clash.Verge_2.4.7_x64-setup.exe',
    opensUrlOnly: true,
    requiresConfirmation: true,
  },
];

export function listDesktopInstallTargets(): DesktopInstallTarget[] {
  return DESKTOP_INSTALL_TARGETS;
}

function commandForDesktopTarget(target: DesktopInstallTarget, latest?: boolean): string | undefined {
  if (latest && target.updateCommand) return target.updateCommand;
  return target.commands?.find((command) => command.platform === process.platform)?.command
    || target.commands?.find((command) => command.platform === 'all')?.command;
}

function runDesktopInstallCommand(command: string): Promise<DesktopInstallRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: process.cwd(),
      shell: true,
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { output += chunk.toString('utf8'); });
    child.on('error', (error) => resolve({ ok: false, output: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, output: output || `Command exited with code ${code}` }));
  });
}

export async function runDesktopInstallTarget(request: DesktopInstallRunRequest): Promise<DesktopInstallRunResult> {
  const target = DESKTOP_INSTALL_TARGETS.find((item) => item.key === request.key);
  if (!target) return { ok: false, output: `Unknown install target: ${request.key}` };

  if (request.confirm !== true) {
    return {
      ok: false,
      requiresConfirmation: true,
      output: `Confirm before installing ${target.displayName}.`,
    };
  }

  if (target.opensUrlOnly) {
    const url = target.installUrl || target.sourceUrl;
    await shell.openExternal(url);
    return { ok: true, output: `Opened ${url}` };
  }

  const command = commandForDesktopTarget(target, request.latest);
  if (!command) return { ok: false, output: `No supported desktop install command for ${target.displayName}.` };
  return runDesktopInstallCommand(command);
}
