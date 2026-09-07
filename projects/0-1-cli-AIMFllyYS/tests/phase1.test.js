const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

test('package exposes hi command and bumps one patch version', () => {
  const [, minor, patch] = pkg.version.match(/^0\.(\d+)\.(\d+)$/).map(Number);
  assert.equal(minor, 7);
  assert.ok(patch >= 0);
  assert.deepEqual(pkg.bin, { hi: './dist/index.js' });
});

test('runtime reports hi usage and package version', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

  const version = execFileSync('node', ['dist/index.js', '--version'], {
    encoding: 'utf8',
  }).trim();
  const help = execFileSync('node', ['dist/index.js', '--help'], {
    encoding: 'utf8',
  });

  assert.equal(version, pkg.version);
  assert.match(help, /用法：hi \[选项\]/);
  assert.match(help, /0-1 CLI/);
});
