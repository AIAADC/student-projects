import { execSync } from 'child_process';
import { InstallCommand, InstallRequirement, PlatformName } from './types';

export function currentPlatform(): PlatformName {
  if (process.platform === 'darwin') return 'darwin';
  if (process.platform === 'win32') return 'win32';
  return 'linux';
}

export function commandExists(command: string): boolean {
  const probe = process.platform === 'win32' ? `where ${command}` : `command -v ${command}`;
  try {
    execSync(probe, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function missingRequirements(requirements: InstallRequirement[]): InstallRequirement[] {
  return requirements.filter((requirement) => !commandExists(requirement.command));
}

export function commandForPlatform(commands: InstallCommand[]): string | undefined {
  const platform = currentPlatform();
  return commands.find((command) => command.platform === platform)?.command
    || commands.find((command) => command.platform === 'all')?.command;
}
