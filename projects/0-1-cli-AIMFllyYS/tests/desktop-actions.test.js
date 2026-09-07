const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(file) {
  return fs.readFileSync(path.join(...file.split('/')), 'utf8');
}

function readRenderer() {
  return [
    'desktop/src/renderer/App.tsx',
    'desktop/src/renderer/codex-shell/CodexShell.tsx',
    'desktop/src/renderer/codex-shell/useConversationState.ts',
    'desktop/src/renderer/codex-shell/ConversationView.tsx',
    'desktop/src/renderer/codex-shell/Composer.tsx',
  ].map(read).join('\n');
}

test('desktop action catalog exposes native install skills clear and utility actions', () => {
  const catalog = read('desktop/src/renderer/action-catalog.ts');

  assert.match(catalog, /id: 'install'/);
  assert.match(catalog, /kind: 'native-install'/);
  assert.match(catalog, /id: 'skills'/);
  assert.match(catalog, /kind: 'native-skills'/);
  assert.match(catalog, /id: 'clear'/);
  assert.match(catalog, /kind: 'native-clear'/);
  assert.match(catalog, /id: 'state'/);
  assert.match(catalog, /id: 'api'/);
  assert.match(catalog, /id: 'pay'/);
});

test('desktop install IPC lists grouped targets and requires explicit confirmation before install', () => {
  const main = read('desktop/src/main/main.ts');
  const installActions = read('desktop/src/main/install-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-install:list/);
  assert.match(main, /desktop-install:run/);
  assert.match(main, /isTrustedSender/);
  assert.match(preload, /listInstallTargets/);
  assert.match(preload, /runInstallTarget/);
  assert.match(installActions, /category: 'cli'/);
  assert.match(installActions, /category: 'ide'/);
  assert.match(installActions, /category: 'environment'/);
  assert.match(installActions, /requiresConfirmation: true/);
  assert.match(installActions, /confirm !== true/);
  assert.match(installActions, /runDesktopInstallCommand/);
  assert.doesNotMatch(installActions, /readline|question\(/);
  assert.doesNotMatch(installActions, /runDesktopCli\(`install/);
});

test('desktop skills IPC lists marketplace and requires explicit target confirmation', () => {
  const main = read('desktop/src/main/main.ts');
  const skillsActions = read('desktop/src/main/skills-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-skills:list/);
  assert.match(main, /desktop-skills:install/);
  assert.match(preload, /listSkillPackages/);
  assert.match(preload, /installSkillPackage/);
  assert.match(skillsActions, /DESKTOP_SKILL_PACKAGES/);
  assert.match(skillsActions, /getDesktopSkillTargets/);
  assert.match(skillsActions, /confirm !== true/);
  assert.match(skillsActions, /installDesktopSkillPackage/);
  assert.doesNotMatch(skillsActions, /readline|question\(/);
});

test('desktop clear IPC scans first and requires explicit confirmation before killing processes', () => {
  const main = read('desktop/src/main/main.ts');
  const clearActions = read('desktop/src/main/clear-actions.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /desktop-clear:scan/);
  assert.match(main, /desktop-clear:kill/);
  assert.match(preload, /scanClearProcesses/);
  assert.match(preload, /killClearProcesses/);
  assert.match(clearActions, /scanDesktopClearProcesses/);
  assert.match(clearActions, /killDesktopClearProcesses/);
  assert.match(clearActions, /confirm !== true/);
  assert.match(clearActions, /taskkill/);
  assert.doesNotMatch(clearActions, /readline|question\(|Remove-Item|Clear-RecycleBin/);
});

test('desktop primary renderer omits native install panel from the ai workspace', () => {
  const renderer = readRenderer();

  assert.doesNotMatch(renderer, /activeAction === 'install'/);
  assert.doesNotMatch(renderer, /listInstallTargets/);
  assert.doesNotMatch(renderer, /runInstallTarget/);
  assert.doesNotMatch(renderer, /InstallPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --install'\)/);
});

test('desktop primary renderer omits native skills panel from the ai workspace', () => {
  const renderer = readRenderer();

  assert.doesNotMatch(renderer, /activeAction === 'skills'/);
  assert.doesNotMatch(renderer, /listSkillPackages/);
  assert.doesNotMatch(renderer, /installSkillPackage/);
  assert.doesNotMatch(renderer, /SkillsPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --skills'\)/);
});

test('desktop primary renderer omits native clear panel from the ai workspace', () => {
  const renderer = readRenderer();

  assert.doesNotMatch(renderer, /activeAction === 'clear'/);
  assert.doesNotMatch(renderer, /scanClearProcesses/);
  assert.doesNotMatch(renderer, /killClearProcesses/);
  assert.doesNotMatch(renderer, /ClearPanel/);
  assert.doesNotMatch(renderer, /runCommand\('hi --clear'\)/);
});

test('desktop permissions deny interactive and arbitrary cli commands', () => {
  const permissions = read('desktop/src/main/permissions.ts');
  const runner = read('desktop/src/main/cli-runner.ts');
  const allowedBlock = permissions.match(/ALLOWED_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';
  const interactiveBlock = permissions.match(/INTERACTIVE_COMMANDS = new Set\(\[([\s\S]*?)\]\)/)?.[1] || '';

  assert.match(permissions, /validateDesktopCommand/);
  assert.match(permissions, /INTERACTIVE_COMMANDS/);
  assert.match(permissions, /ALLOWED_COMMANDS/);
  assert.match(runner, /validateDesktopCommand/);
  assert.match(interactiveBlock, /'clear'/);
  assert.match(interactiveBlock, /'skills'/);
  assert.match(interactiveBlock, /'install'/);
  assert.match(interactiveBlock, /'ai'/);
  assert.doesNotMatch(allowedBlock, /'clear'/);
  assert.doesNotMatch(allowedBlock, /'skills'/);
  assert.doesNotMatch(allowedBlock, /'install'/);
  assert.doesNotMatch(allowedBlock, /'ai'/);
});

test('desktop cli runner times out long running commands', () => {
  const runner = read('desktop/src/main/cli-runner.ts');

  assert.match(runner, /CLI_TIMEOUT_MS/);
  assert.match(runner, /\.kill\(/);
  assert.match(runner, /timed out/i);
});

test('desktop primary renderer keeps command output panels out of the ai workspace', () => {
  const renderer = readRenderer();
  const styles = read('desktop/src/renderer/styles.css');

  assert.doesNotMatch(renderer, /copyOutput/);
  assert.doesNotMatch(renderer, /Copy output/);
  assert.doesNotMatch(renderer, /commandBusy/);
  assert.doesNotMatch(renderer, /outputPanel/);
  assert.doesNotMatch(styles, /\.outputPanel/);
  assert.doesNotMatch(styles, /\.outputHeader/);
});

test('desktop preload rejects non-whitelisted runCommand requests', () => {
  const preload = read('desktop/src/preload/index.ts');
  const permissions = read('desktop/src/main/permissions.ts');

  assert.match(preload, /validateDesktopCommand/);
  assert.match(permissions, /export function validateDesktopCommand/);
});

test('desktop ai bridge uses dedicated ipc and does not expose raw shell', () => {
  const main = read('desktop/src/main/main.ts');
  const runner = read('desktop/src/main/cli-runner.ts');
  const preload = read('desktop/src/preload/index.ts');

  assert.match(main, /ai:launch/);
  assert.match(runner, /launchDesktopAiSession/);
  assert.match(preload, /launchAiSession/);
  assert.match(runner, /--ai/);
  assert.doesNotMatch(runner, /launchDesktopAiSession[\s\S]*shell:\s*true/);
  assert.doesNotMatch(preload, /runCommand\([^)]*['"]ai['"]/);
});

test('desktop renderer separates ai bridge from dashboard commands', () => {
  const renderer = readRenderer();

  assert.doesNotMatch(renderer, /launchAiSession/);
  assert.match(renderer, /sendAiMessage/);
  assert.doesNotMatch(renderer, /runCommand\(['"]hi --ai['"]\)/);
  assert.doesNotMatch(renderer, /runCommand\(['"]ai['"]\)/);
  assert.doesNotMatch(renderer, /outputPanel/);
});

test('desktop renderer mirrors cli modes and balanced shell layout', () => {
  const renderer = readRenderer();
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(renderer, /read-only/);
  assert.match(renderer, /asks before tools/);
  assert.match(renderer, /no edits/);
  assert.match(renderer, /modeTabs/);
  assert.match(styles, /\.codexShell\s*\{/);
  assert.match(styles, /\.sessionRail\s*\{/);
  assert.match(styles, /\.conversationPane\s*\{/);
  assert.doesNotMatch(styles, /\.inspectorPane\s*\{/);
  assert.match(styles, /grid-template-columns:\s*280px minmax\(0,\s*1fr\)/);
  assert.match(styles, /\.composerBar\s*\{/);
});

test('desktop renderer shows a live ai thinking and tool activity timeline', () => {
  const conversationState = read('desktop/src/renderer/codex-shell/useConversationState.ts');
  const timeline = read('desktop/src/renderer/codex-shell/AgentTimeline.tsx');
  const styles = read('desktop/src/renderer/styles.css');

  // The static three-chip strip (START_ACTIVITY) is replaced by a live timeline
  // reduced from the agent-event stream.
  assert.doesNotMatch(conversationState, /START_ACTIVITY/);
  assert.match(conversationState, /reduceEvent/);
  assert.match(timeline, /Thinking|thinking/);
  assert.match(timeline, /agentTimeline/);
  // A thinking indicator + per-tool rows are styled.
  assert.match(styles, /\.thinkingDot/);
  assert.match(styles, /\.activityRow/);
});

test('desktop vite build uses file-safe relative renderer assets', () => {
  const viteConfig = read('desktop/vite.config.ts');

  assert.match(viteConfig, /base:\s*['"]\.\/['"]/);
  assert.match(viteConfig, /emptyOutDir:\s*true/);
});

test('desktop primary renderer keeps settings panel out of the ai workspace', () => {
  const renderer = readRenderer();

  assert.doesNotMatch(renderer, /\/setting/);
  assert.doesNotMatch(renderer, /SettingsPanel/);
  assert.doesNotMatch(renderer, /Open AI terminal/i);
});

test('desktop command panel runs the classic cli commands GUI-style for every catalog action', () => {
  const rail = read('desktop/src/renderer/codex-shell/SessionRail.tsx');
  const panel = read('desktop/src/renderer/codex-shell/CommandPanel.tsx');
  const catalog = read('desktop/src/renderer/action-catalog.ts');

  // Every classic command id is still present and surfaced as a clickable card.
  ['clear', 'skills', 'install', 'state', 'api', 'pay'].forEach((id) => {
    assert.match(catalog, new RegExp(`id: '${id}'`), `${id} action missing from catalog`);
  });
  assert.match(rail, /desktopActions\.map/);
  // state/api/pay run through the whitelisted runCommand path inside the inspector hook.
  const inspector = read('desktop/src/renderer/codex-shell/useInspectorState.ts');
  assert.match(inspector, /runCommand\(action\.command\)/);
  assert.match(inspector, /validateDesktopCommand|window\.zeroOneCli\.runCommand/);
  // SAFETY: native install/skills/clear still confirm: true before running.
  assert.match(inspector, /confirm:\s*true/);
  // The panel surfaces command output without reintroducing the old output panel class.
  assert.match(panel, /commandOutput/);
  assert.doesNotMatch(panel, /outputPanel/);
});

test('desktop diff card consumes the exact Claude diff palette tokens', () => {
  const styles = read('desktop/src/renderer/styles.css');

  assert.match(styles, /--diff-added-word:\s*#38a660/);
  assert.match(styles, /--diff-removed-word:\s*#b3596b/);
  assert.match(styles, /\.diffAdded[\s\S]*var\(--diff-added-bg\)/);
  assert.match(styles, /\.diffRemoved[\s\S]*var\(--diff-removed-bg\)/);
});
