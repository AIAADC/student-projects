import * as fs from 'fs';
import * as path from 'path';
import { renderMarkdown } from '../utils/markdown';

interface AppInfo {
  name: string;
  paths: string[];
  launchCmd: string;
  description: string;
}

const COMMON_APPS: AppInfo[] = [
  {
    name: 'VS Code',
    paths: [
      'C:/Users/Lenovo/AppData/Local/Programs/Microsoft VS Code/Code.exe',
      'C:/Program Files/Microsoft VS Code/Code.exe'
    ],
    launchCmd: 'code .',
    description: 'Code editor'
  },
  {
    name: 'Cursor',
    paths: [
      'C:/Users/Lenovo/AppData/Local/Cursor/app-*/Cursor.exe',
      'C:/Program Files/Cursor/Cursor.exe'
    ],
    launchCmd: 'cursor .',
    description: 'AI-first code editor'
  },
  {
    name: 'Windows Terminal',
    paths: [
      'C:/Users/Lenovo/AppData/Local/Microsoft/WindowsApps/wt.exe',
      'C:/Windows/System32/windowsterminal.exe'
    ],
    launchCmd: 'wt',
    description: 'Windows terminal'
  },
  {
    name: 'Chrome',
    paths: [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Users/Lenovo/AppData/Local/Google/Chrome/Application/chrome.exe'
    ],
    launchCmd: 'start chrome',
    description: 'Web browser'
  },
  {
    name: 'Edge',
    paths: [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
    ],
    launchCmd: 'start msedge',
    description: 'Microsoft Edge browser'
  },
  {
    name: 'GitHub Desktop',
    paths: [
      'C:/Users/Lenovo/AppData/Local/GitHubDesktop/GitHubDesktop.exe',
      'C:/Program Files/GitHub Desktop/GitHubDesktop.exe'
    ],
    launchCmd: 'github',
    description: 'Git GUI client'
  },
  {
    name: 'Node.js',
    paths: [
      'C:/Program Files/nodejs/node.exe',
      'C:/Program Files (x86)/nodejs/node.exe'
    ],
    launchCmd: 'node',
    description: 'JavaScript runtime'
  },
  {
    name: 'Python',
    paths: [
      'C:/Users/Lenovo/AppData/Local/Programs/Python/Python*/python.exe',
      'C:/Python*/python.exe'
    ],
    launchCmd: 'python',
    description: 'Python runtime'
  },
  {
    name: 'Claude Code',
    paths: [
      'C:/Users/Lenovo/AppData/Roaming/npm/claude.cmd',
      'C:/Program Files/claude/bin/claude.cmd'
    ],
    launchCmd: 'claude',
    description: 'Anthropic CLI'
  },
  {
    name: 'Kiro',
    paths: [],
    launchCmd: 'kiro-cli',
    description: 'Kiro CLI (AI coding)'
  },
  {
    name: 'File Explorer',
    paths: [
      'C:/Windows/explorer.exe'
    ],
    launchCmd: 'explorer .',
    description: 'File explorer'
  },
  {
    name: 'Notepad',
    paths: [
      'C:/Windows/notepad.exe'
    ],
    launchCmd: 'notepad',
    description: 'Text editor'
  },
  {
    name: 'PowerShell',
    paths: [
      'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      'C:/Windows/System32/WindowsPowerShell/v1.0/pwsh.exe'
    ],
    launchCmd: 'pwsh',
    description: 'PowerShell terminal'
  }
];

function findAppPath(app: AppInfo): string | null {
  if (app.paths.length === 0) return null;

  for (const p of app.paths) {
    if (p.includes('*')) {
      const baseDir = path.dirname(p);
      try {
        if (fs.existsSync(baseDir)) {
          const files = fs.readdirSync(baseDir);
          const match = files.find(f => path.basename(p).replace('*', '') === f.substring(0, path.basename(p).indexOf('*') > -1 ? path.basename(p).indexOf('*') : f.length));
          if (match) return path.join(baseDir, match);
        }
      } catch {}
    } else if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export function getApps(): string {
  const md: string[] = [
    '## App Launch Commands',
    '',
    '| 状态 | 应用 | 启动命令 | 说明 | 路径 |',
    '| :---: | --- | --- | --- | --- |',
  ];

  for (const app of COMMON_APPS) {
    const foundPath = findAppPath(app);
    const status = foundPath ? '✓' : '○';
    const pathStr = foundPath ? foundPath.replace(/\\/g, '/') : '—';
    md.push(`| ${status} | ${app.name} | \`${app.launchCmd}\` | ${app.description} | ${pathStr} |`);
  }

  md.push('');
  md.push('### 💡 Quick Launch Examples');
  md.push('');
  md.push('- `code .` — Open VS Code here');
  md.push('- `cursor .` — Open Cursor here');
  md.push('- `explorer .` — Open File Explorer here');
  md.push('- `wt` — Open Windows Terminal here');
  md.push('- `start chrome` — Open Chrome');

  return renderMarkdown(md.join('\n'));
}
