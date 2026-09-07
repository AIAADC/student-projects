import chalk from 'chalk';
import { ALL_INSTALL_TARGETS, CLI_INSTALL_TARGETS, ENV_INSTALL_TARGETS, IDE_INSTALL_TARGETS } from './registry';
import { runInstallTarget } from './runner';
import { selectInstallTarget } from './menu';
import { InstallTarget } from './types';

export { CLI_INSTALL_TARGETS, ENV_INSTALL_TARGETS, IDE_INSTALL_TARGETS };

export interface InstallRequest {
  tool?: string;
  latest: boolean;
}

function cleanArg(value: string): string {
  return value.replace(/^-+/, '').toLowerCase();
}

export function parseInstallArgs(argv: string[]): InstallRequest {
  const installIndex = argv.indexOf('--install');
  if (installIndex === -1) return { latest: false };

  const args = argv.slice(installIndex + 1).map(cleanArg).filter(Boolean);
  const latest = args.includes('latest');
  const tool = args.find((arg) => arg !== 'latest');
  return tool ? { tool, latest } : { latest };
}

export function resolveInstallTarget(tool: string): InstallTarget | undefined {
  const normalized = cleanArg(tool);
  return ALL_INSTALL_TARGETS.find((target) =>
    target.key === normalized || target.aliases.includes(normalized)
  );
}

export async function handleInstall(request: InstallRequest): Promise<void> {
  const target = request.tool
    ? resolveInstallTarget(request.tool)
    : await selectInstallTarget();

  if (!target) {
    console.log(chalk.red(`Unknown install target: ${request.tool || ''}`));
    console.log(chalk.gray(`Available: ${ALL_INSTALL_TARGETS.map((item) => item.key).join(', ')}`));
    return;
  }

  await runInstallTarget(target, request.latest);
}
