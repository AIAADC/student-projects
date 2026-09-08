import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { loadConfig, saveConfig, getProjectRoot } from '../utils/config';
import { renderMarkdown } from '../utils/markdown';

// In-memory cache for project scanning (30s TTL)
const scanCache = new Map<string, { projects: ProjectInfo[]; timestamp: number }>();
const CACHE_TTL = 30000;

/**
 * Prompt user to set project root on first run. Returns the configured path.
 */
export function resolveProjectRootInput(input: string): string | null {
  const normalized = input.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized || null;
}

export async function ensureProjectRoot(): Promise<string> {
  const existing = getProjectRoot();
  if (existing && fs.existsSync(existing)) return existing;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> => new Promise(r => rl.question(q, r));

  console.log(chalk.bold.yellow('\n\u9996\u6b21\u8fd0\u884c\u914d\u7f6e / First Run Setup'));
  console.log(chalk.gray('  \u8bf7\u8bbe\u7f6e\u5b58\u653e\u9879\u76ee\u7684\u4e3b\u6587\u4ef6\u5939\u8def\u5f84\uff0c\u76f4\u63a5\u56de\u8f66\u53ef\u8df3\u8fc7'));
  console.log(chalk.gray('  Set the root folder that contains your projects, or press Enter to skip\n'));

  let root = '';
  while (!root) {
    const input = resolveProjectRootInput(await ask(chalk.cyan('  \u9879\u76ee\u4e3b\u6587\u4ef6\u5939\u8def\u5f84 (e.g. C:/project): ')));
    if (input === null) {
      console.log(chalk.yellow('\n  \u5df2\u8df3\u8fc7\u9879\u76ee\u76ee\u5f55\u7ed1\u5b9a\uff0c\u53ef\u7a0d\u540e\u91cd\u65b0\u914d\u7f6e\u3002\n'));
      rl.close();
      return '';
    }
    if (fs.existsSync(input)) {
      root = input;
    } else {
      console.log(chalk.red('  \u8def\u5f84\u4e0d\u5b58\u5728\uff0c\u8bf7\u91cd\u65b0\u8f93\u5165 / Path does not exist'));
    }
  }

  const config = loadConfig();
  config.projectRoot = root;
  saveConfig(config);
  console.log(chalk.green('\n  \u2713 \u5df2\u4fdd\u5b58 ' + root + '\n'));
  rl.close();
  return root;
}

interface ProjectInfo {
  name: string;
  path: string;
  description: string;
}

function scanProjects(projectRoot: string): ProjectInfo[] {
  const cached = scanCache.get(projectRoot);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.projects;
  }

  const projects: ProjectInfo[] = [];
  const excludeDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.cache', '__pycache__', 'venv', '.venv', '.env'];

  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (excludeDirs.some(d => entry.name.toLowerCase().includes(d.toLowerCase()))) continue;

      const fullPath = path.join(projectRoot, entry.name);

      // Try to get description from package.json or README
      let description = '';
      const pkgPath = path.join(fullPath, 'package.json');
      const readmePath = path.join(fullPath, 'README.md');

      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          description = pkg.description || pkg.name || '';
        } catch {}
      }

      if (!description && fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8');
        const firstLine = content.split('\n').find(l => l.trim() && !l.startsWith('#'));
        if (firstLine) description = firstLine.trim().substring(0, 60);
      }

      projects.push({
        name: entry.name,
        path: fullPath.replace(/\\/g, '/'),
        description: description || ''
      });
    }
  } catch (error) {
    console.log(chalk.red(`Error scanning projects: ${error}`));
  }

  const sorted = projects.sort((a, b) => a.name.localeCompare(b.name));
  scanCache.set(projectRoot, { projects: sorted, timestamp: Date.now() });
  return sorted;
}

export function getProjectPaths(projectRoot?: string): string {
  const root = projectRoot || getProjectRoot();
  if (!root) {
    return renderMarkdown('\u672a\u914d\u7f6e\u9879\u76ee\u8def\u5f84\u3002\u8fd0\u884c `hi` \u540e\u53ef\u7ed1\u5b9a\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u56de\u8f66\u8df3\u8fc7\u3002');
  }

  const projects = scanProjects(root);

  if (projects.length === 0) {
    return renderMarkdown('No projects found');
  }

  const md: string[] = ['## Project Paths', ''];
  for (const proj of projects) {
    md.push(`### ${proj.name}`);
    md.push('');
    md.push('```text');
    md.push(proj.path);
    md.push('```');
    if (proj.description) {
      md.push(proj.description);
    }
    md.push('');
  }

  return renderMarkdown(md.join('\n'));
}
