import { renderHomeHeader } from './home';
import { getGitHubInfo } from './github';
import { getProjectPaths, ensureProjectRoot } from './paths';
import { getCliCommands } from './cli';
import { getApps } from './apps';
import { renderMarkdown } from '../utils/markdown';

export async function runStatePage(task: string | undefined, version: string): Promise<void> {
  console.log(renderHomeHeader(version));

  const projectRoot = await ensureProjectRoot();

  // GitHub status renders its own ANSI output; only the section header is ours.
  console.log(renderMarkdown('## GitHub Status'));
  await getGitHubInfo({ showAccounts: true, showIssues: true });

  // Sub-outputs below are already rendered markdown (ANSI). Print as-is to avoid double-rendering.
  console.log(getProjectPaths(projectRoot));
  console.log(getCliCommands(task));
  console.log(getApps());

  const usage = [
    '## Usage: `hi [options]`',
    '',
    '| 选项 | 说明 |',
    '| --- | --- |',
    '| `--state` | Show GitHub, project paths, CLI commands, and app status |',
    '| `--install` | Install AI CLI tools, AI IDEs, and proxy environment tools |',
    '| `--skills` | Install AI workflow skills |',
    '| `--api` | Open AI provider API guide |',
    '| `--pay` | Open payment, card, and relay resource guide |',
  ].join('\n');
  console.log(renderMarkdown(usage));
}
