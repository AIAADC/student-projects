export type InstallCategory = 'cli' | 'ide' | 'environment';
export type PlatformName = 'win32' | 'darwin' | 'linux';

export interface InstallCommand {
  platform: PlatformName | 'all';
  command: string;
}

export interface InstallRequirement {
  command: string;
  name: string;
  installHint: string;
}

export interface InstallTarget {
  key: string;
  displayName: string;
  category: InstallCategory;
  aliases: string[];
  description: string;
  sourceUrl: string;
  installUrl?: string;
  requirements: InstallRequirement[];
  versionCommand?: string;
  updateCommand?: string;
  commands: InstallCommand[];
  opensUrlOnly?: boolean;
  notes?: string;
}
