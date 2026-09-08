import * as fs from 'fs';
import * as path from 'path';

const CONFIG_PATH = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.coding-cli.json');

export interface CliConfig {
  projectRoot?: string;
}

export function loadConfig(): CliConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function getProjectRoot(): string {
  return loadConfig().projectRoot || '';
}
