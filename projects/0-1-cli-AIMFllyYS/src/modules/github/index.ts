import chalk from 'chalk';
import { getGitHubAccounts, displayAccounts, interactiveSwitch, getActiveAccount, type GitHubAccount } from './auth';
import { displayRecentIssues, getRecentIssues, type IssueInfo } from './issues';

export { displayAccounts, interactiveSwitch, getGitHubAccounts, getActiveAccount };
export type { GitHubAccount, IssueInfo };

export interface GitHubInfoOptions {
  showAccounts?: boolean;
  showIssues?: boolean;
  issuesDays?: number;
}

export async function getGitHubInfo(options: GitHubInfoOptions = {}): Promise<void> {
  const { showAccounts = true, showIssues = true, issuesDays = 7 } = options;

  // Display accounts section
  if (showAccounts) {
    displayAccounts();
  }

  // Display issues section
  if (showIssues) {
    await displayRecentIssues(issuesDays);
  }
}

export function getGhAuthCommands(): string {
  return `
${chalk.bold('🔐 GitHub Auth Commands:')}

${chalk.cyan('  gh auth status')}
    View current login status

${chalk.cyan('  gh auth login')}
    Interactive login

${chalk.cyan('  gh auth logout')}
    Logout

${chalk.cyan('  gh auth switch')}
    Switch between accounts (interactive)

${chalk.green('  hi --gh')}
    Show all GitHub accounts and recent issues

${chalk.green('  hi --gh accounts')}
    Show all GitHub accounts only

${chalk.green('  hi --gh switch')}
    Interactive account switcher

${chalk.green('  hi --gh issues')}
    Show recent issues only
`;
}
