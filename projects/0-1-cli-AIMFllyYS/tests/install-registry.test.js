const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('install registry includes required CLI tools and aliases', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { CLI_INSTALL_TARGETS, resolveInstallTarget } = require('../dist/modules/install');

  const keys = CLI_INSTALL_TARGETS.map((target) => target.key);
  for (const key of ['cc', 'kimi', 'codex', 'kiro', 'mimo', 'antigravity', 'opencode', 'openclaw', 'hermes']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }

  assert.equal(resolveInstallTarget('claude-code')?.key, 'cc');
  assert.equal(resolveInstallTarget('devin')?.key, 'windsuf');
  assert.equal(resolveInstallTarget('trae-cn')?.key, 'trae-cn');
});

test('install registry includes IDE and environment tools', () => {
  const { IDE_INSTALL_TARGETS, ENV_INSTALL_TARGETS } = require('../dist/modules/install');
  const ideKeys = IDE_INSTALL_TARGETS.map((target) => target.key);
  const envKeys = ENV_INSTALL_TARGETS.map((target) => target.key);

  for (const key of ['vscode', 'codex-app', 'cursor', 'trae', 'windsuf', 'zed', 'antigravity-ide', 'qoder', 'codebuddy', 'workbuddy', 'trae-solo', 'qoderwork', 'kiro-ide', 'trae-cn']) {
    assert.ok(ideKeys.includes(key), `missing ${key}`);
  }

  for (const key of ['proxy', 'virtual-card', 'fingerprint-browser']) {
    assert.ok(envKeys.includes(key), `missing ${key}`);
  }
});

test('install argument parser accepts tool and latest shorthand', () => {
  const { parseInstallArgs } = require('../dist/modules/install');

  assert.deepEqual(parseInstallArgs(['--install']), { latest: false });
  assert.deepEqual(parseInstallArgs(['--install', '-cc']), { tool: 'cc', latest: false });
  assert.deepEqual(parseInstallArgs(['--install', '-opencode', '-latest']), { tool: 'opencode', latest: true });
});
