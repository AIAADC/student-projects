import chalk from 'chalk';
import { execSync } from 'child_process';
import { interactiveSelect } from '../../utils/selector';

export interface GitHubAccount {
  username: string;
  token: string;
  scopes: string[];
  isActive: boolean;
  hostname: string;
}

/**
 * Parse gh auth status output to extract account information
 */
export function parseGhAuthStatus(): GitHubAccount[] {
  try {
    const output = execSync('gh auth status', { encoding: 'utf-8', timeout: 10000 });
    return parseAuthOutput(output);
  } catch (error: any) {
    // Try with extended output
    try {
      const output = execSync('gh auth status 2>&1', { encoding: 'utf-8', timeout: 10000 });
      return parseAuthOutput(output);
    } catch {
      return [];
    }
  }
}

function parseAuthOutput(output: string): GitHubAccount[] {
  const accounts: GitHubAccount[] = [];
  const lines = output.split('\n');

  let currentHostname = 'github.com';
  let currentUsername = '';
  let currentToken = '';
  let currentScopes: string[] = [];
  let isActive = false;

  for (const line of lines) {
    // New host
    const hostMatch = line.match(/^(\S+)\s*$/);
    if (hostMatch && !line.includes('✓') && !line.includes('-')) {
      // Save previous account if exists
      if (currentUsername) {
        accounts.push({
          username: currentUsername,
          token: currentToken,
          scopes: currentScopes,
          isActive,
          hostname: currentHostname
        });
        currentScopes = [];
      }
      currentHostname = hostMatch[1].trim();
      continue;
    }

    // Logged in account
    const loginMatch = line.match(/✓\s+Logged in to (?:github\.com|[\w.-]+)\s+account\s+(\S+)/);
    if (loginMatch) {
      // Save previous if switching hosts
      if (currentUsername) {
        accounts.push({
          username: currentUsername,
          token: currentToken,
          scopes: currentScopes,
          isActive,
          hostname: currentHostname
        });
        currentScopes = [];
      }
      currentUsername = loginMatch[1];
      isActive = line.includes('Active account: true');
      continue;
    }

    // Token info
    const tokenMatch = line.match(/Token:\s+(\S+)/);
    if (tokenMatch && currentUsername) {
      currentToken = tokenMatch[1];
      continue;
    }

    // Scopes
    const scopesMatch = line.match(/Token scopes:\s*(.+)/);
    if (scopesMatch && currentUsername) {
      const scopesStr = scopesMatch[1].replace(/'/g, '').trim();
      if (scopesStr) {
        currentScopes = scopesStr.split(',').map(s => s.trim());
      }
      continue;
    }

    // Active indicator
    if (line.includes('Active account:')) {
      isActive = line.includes('true');
    }
  }

  // Don't forget the last account
  if (currentUsername) {
    accounts.push({
      username: currentUsername,
      token: currentToken,
      scopes: currentScopes,
      isActive,
      hostname: currentHostname
    });
  }

  return accounts;
}

/**
 * Get all GitHub accounts from gh CLI
 */
export function getGitHubAccounts(): GitHubAccount[] {
  return parseGhAuthStatus();
}

/**
 * Get the currently active GitHub account
 */
export function getActiveAccount(): GitHubAccount | null {
  const accounts = getGitHubAccounts();
  return accounts.find(acc => acc.isActive) || null;
}

/**
 * Switch to a different GitHub account
 */
export async function switchAccount(username: string): Promise<boolean> {
  try {
    execSync(`gh auth switch --user ${username}`, { encoding: 'utf-8', timeout: 10000 });
    return true;
  } catch (error) {
    console.log(chalk.red(`Failed to switch to account: ${username}`));
    return false;
  }
}

/**
 * Interactive account switcher
 */
export async function interactiveSwitch(): Promise<void> {
  const accounts = getGitHubAccounts();

  if (accounts.length === 0) {
    console.log(chalk.yellow('No GitHub accounts found. Please run: gh auth login'));
    return;
  }

  if (accounts.length === 1) {
    console.log(chalk.cyan(`Only one account is available: ${accounts[0].username}`));
    return;
  }

  await interactiveSelect({
    title: '🔄 切换 GitHub 账号 / Switch GitHub Account',
    options: accounts.map(acc => ({
      label: acc.isActive ? `✓ ${acc.username} (current)` : `  ${acc.username}`,
      value: acc.username,
      description: acc.scopes.slice(0, 3).join(', ') + (acc.scopes.length > 3 ? '...' : '')
    })),
    onSelect: async (username) => {
      const success = await switchAccount(username);
      if (success) {
        console.log(chalk.green(`\n✅ Successfully switched to: ${username}`));
      }
    },
    onCancel: () => {
      console.log(chalk.gray('\nCancelled.'));
    }
  });
}

/**
 * Display all GitHub accounts
 */
export function displayAccounts(): void {
  const accounts = getGitHubAccounts();

  console.log(chalk.bold.cyan('\n🔐 GitHub Accounts:\n'));

  if (accounts.length === 0) {
    console.log(chalk.yellow('  No GitHub accounts found.'));
    console.log(chalk.gray('  Run "gh auth login" to add an account.\n'));
    return;
  }

  for (const acc of accounts) {
    const activeMark = acc.isActive ? chalk.green('✓') : chalk.gray('○');
    const activeTag = acc.isActive ? chalk.green(' [ACTIVE]') : '';

    console.log(`  ${activeMark} ${chalk.white(acc.username)}${activeTag}`);
    console.log(chalk.gray(`    Host: ${acc.hostname}`));
    console.log(chalk.gray(`    Scopes: ${acc.scopes.join(', ') || 'none'}`));
    console.log('');
  }

  console.log(chalk.gray('  Use "hi --gh switch" to switch accounts.'));
  console.log(chalk.gray('  Use "gh auth login" to add a new account.'));
  console.log(chalk.gray('  Use "gh auth logout" to remove an account.\n'));
}
