import { execSync } from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';
import { InstallTarget } from './types';
import { commandForPlatform, missingRequirements } from './environment';
import { renderMarkdown } from '../../utils/markdown';

function askConfirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [Y/n] `, (answer) => {
      rl.close();
      resolve(answer.trim() === '' || /^y$/i.test(answer.trim()));
    });
  });
}

function openUrl(url: string): void {
  const command = process.platform === 'win32'
    ? `start "" "${url}"`
    : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  execSync(command, { stdio: 'ignore' });
}

export async function runInstallTarget(target: InstallTarget, latest = false): Promise<void> {
  const header: string[] = [`## ${target.displayName}`, '', target.description];
  if (target.notes) {
    header.push('', target.notes);
  }
  header.push('', `- Source: <${target.sourceUrl}>`);
  console.log(renderMarkdown(header.join('\n')));

  if (target.opensUrlOnly) {
    const url = target.installUrl || target.sourceUrl;
    console.log(renderMarkdown(`This target opens the official page: <${url}>`));
    if (await askConfirm('Open it now?')) openUrl(url);
    return;
  }

  const missing = missingRequirements(target.requirements);
  if (missing.length > 0) {
    const md: string[] = ['### Missing requirements', ''];
    for (const requirement of missing) {
      md.push(`- **${requirement.name}**: ${requirement.installHint}`);
    }
    console.log(renderMarkdown(md.join('\n')));
    return;
  }

  if (latest && target.versionCommand) {
    console.log(renderMarkdown(`Current version check:\n\n\`\`\`bash\n${target.versionCommand}\n\`\`\``));
    try {
      execSync(target.versionCommand, { stdio: 'inherit' });
    } catch {
      console.log(chalk.yellow('Version command failed; the tool may not be installed yet.'));
    }
  }

  const command = latest && target.updateCommand
    ? target.updateCommand
    : commandForPlatform(target.commands);

  if (!command) {
    console.log(chalk.red('No supported install command for this platform.'));
    return;
  }

  console.log(renderMarkdown(`### Install command\n\n\`\`\`bash\n${command}\n\`\`\``));
  if (await askConfirm('Run this command?')) {
    execSync(command, { stdio: 'inherit' });
  }
}
