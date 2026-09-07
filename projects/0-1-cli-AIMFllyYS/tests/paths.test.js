const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

test('empty project root input can be skipped', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { resolveProjectRootInput } = require('../dist/modules/paths');

  assert.equal(resolveProjectRootInput(''), null);
  assert.equal(resolveProjectRootInput('   '), null);
});

test('missing project root message points to hi command', () => {
  const home = mkdtempSync(join(tmpdir(), 'hi-cli-home-'));
  process.env.USERPROFILE = home;
  process.env.HOME = home;
  delete require.cache[require.resolve('../dist/utils/config')];
  delete require.cache[require.resolve('../dist/modules/paths')];

  const { getProjectPaths } = require('../dist/modules/paths');
  const output = getProjectPaths('');

  assert.match(output, /hi/);
  assert.doesNotMatch(output, /coding/);
});
