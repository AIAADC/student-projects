import { execSync } from 'child_process';

export function openUrl(url: string): void {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  execSync(command, { stdio: 'ignore' });
}
