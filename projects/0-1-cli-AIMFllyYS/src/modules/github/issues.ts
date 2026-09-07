import chalk from 'chalk';
import * as https from 'https';
import { getActiveAccount } from './auth';

// Shared agent for GitHub API (keep-alive)
const githubAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 3,
  maxFreeSockets: 1,
  timeout: 30000,
});

function githubGet(path: string, token?: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: path,
      method: 'GET',
      agent: githubAgent,
      headers: {
        'User-Agent': '0-1-CLI',
        'Accept': 'application/vnd.github+json',
        ...(token && { 'Authorization': `Bearer ${token}` })
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('GitHub API 请求超时 (30s)'));
    });
    req.end();
  });
}

export interface IssueInfo {
  number: number;
  title: string;
  repo: string;
  createdAt: string;
  url: string;
}

export async function getRecentIssues(days: number = 7, token?: string): Promise<IssueInfo[]> {
  const activeAccount = token ? null : getActiveAccount();
  const authToken = token || activeAccount?.token || '';
  const username = activeAccount?.username;

  if (!username || !authToken) return [];

  const issues: IssueInfo[] = [];
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  // Dynamically fetch user's repos instead of hardcoded list
  let repos: string[] = [];
  try {
    const repoData: any[] = await githubGet(`/users/${username}/repos?per_page=100&sort=updated`, authToken);
    if (Array.isArray(repoData)) {
      repos = repoData.map((r: any) => r.name);
    }
  } catch {}

  // Parallel fetch with concurrency limit (max 3 at a time)
  const CONCURRENCY = 3;
  for (let i = 0; i < repos.length; i += CONCURRENCY) {
    const batch = repos.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        try {
          const data: any[] = await githubGet(
            `/repos/${username}/${repo}/issues?since=${sinceStr}&state=open&per_page=20`,
            authToken
          );
          if (!Array.isArray(data)) return [];
          return data
            .filter((issue: any) => !issue.pull_request)
            .map((issue: any) => ({
              number: issue.number,
              title: issue.title,
              repo: repo,
              createdAt: issue.created_at,
              url: issue.html_url,
            }));
        } catch {
          return [];
        }
      })
    );
    for (const result of batchResults) {
      issues.push(...result);
    }
  }

  return issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function displayRecentIssues(days: number = 7): Promise<void> {
  const account = getActiveAccount();

  if (!account?.token) {
    console.log(chalk.yellow('\n⚠ No GitHub token available.'));
    console.log(chalk.gray('   Please run "gh auth login" or check your token.\n'));
    return;
  }

  console.log(chalk.bold(`\n📋 Recent Issues (last ${days} days):`));
  console.log(chalk.gray(`  Account: ${account.username}\n`));

  try {
    const issues = await getRecentIssues(days, account.token);

    if (issues.length === 0) {
      console.log(chalk.gray('  No new issues in the last 7 days.\n'));
      return;
    }

    // Group by repo
    const byRepo = new Map<string, IssueInfo[]>();
    for (const issue of issues) {
      if (!byRepo.has(issue.repo)) {
        byRepo.set(issue.repo, []);
      }
      byRepo.get(issue.repo)!.push(issue);
    }

    for (const [repo, repoIssues] of byRepo) {
      console.log(chalk.cyan(`  ${repo}:`));
      for (const issue of repoIssues.slice(0, 5)) {
        const age = Math.floor((Date.now() - new Date(issue.createdAt).getTime()) / (1000 * 60 * 60 * 24));
        const ageStr = age === 0 ? 'today' : `${age}d ago`;
        console.log(chalk.white(`    #${issue.number} ${issue.title}`) + chalk.gray(` (${ageStr})`));
      }
      if (repoIssues.length > 5) {
        console.log(chalk.gray(`    ... and ${repoIssues.length - 5} more`));
      }
      console.log('');
    }

    console.log(chalk.green(`✅ Total: ${issues.length} issue(s)\n`));
  } catch (error: any) {
    console.log(chalk.red(`\n❌ Failed to fetch issues: ${error.message}\n`));
  }
}
