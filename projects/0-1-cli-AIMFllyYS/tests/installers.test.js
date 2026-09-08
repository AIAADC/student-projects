const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('windows installer registers hi command', () => {
  const ps1 = readFileSync('scripts/install.ps1', 'utf8');

  assert.match(ps1, /npm link/);
  assert.match(ps1, /hi --help/);
  assert.match(ps1, /hi --chat/);
  assert.doesNotMatch(ps1, /coding --help/);
});

test('windows installer validates repository identity before reusing current directory', () => {
  const ps1 = readFileSync('scripts/install.ps1', 'utf8');

  assert.match(ps1, /function Test-RepoRoot/);
  assert.match(ps1, /\$pkg\.name -eq "coding-cli"/);
  assert.match(ps1, /\$pkg\.bin\.hi -eq "\.\/dist\/index\.js"/);
  assert.doesNotMatch(ps1, /if \(Test-Path "\.\\package\.json"\) \{ return \(Get-Location\)\.Path \}/);
});

test('windows installer reuses an existing valid install directory', () => {
  const ps1 = readFileSync('scripts/install.ps1', 'utf8');

  assert.match(ps1, /if \(Test-Path \$targetDir\) \{/);
  assert.match(ps1, /if \(Test-RepoRoot \$targetDir\) \{/);
  assert.match(ps1, /Using existing repository/);
  assert.match(ps1, /Set-Location \$targetDir/);
});

test('macos and linux installer exists and registers hi command', () => {
  const sh = readFileSync('scripts/install.sh', 'utf8');

  assert.match(sh, /npm run build/);
  assert.match(sh, /npm link/);
  assert.match(sh, /hi --help/);
  assert.doesNotMatch(sh, /coding --help/);
});

test('installers do not hardcode auth tokens', () => {
  const combined = [
    readFileSync('scripts/install.ps1', 'utf8'),
    readFileSync('scripts/install.sh', 'utf8'),
  ].join('\n');

  assert.doesNotMatch(combined, /ghp_[A-Za-z0-9_]+/);
  assert.doesNotMatch(combined, /SUPABASE_ACCESS_TOKEN=/);
  assert.doesNotMatch(combined, /GITHUB_PERSONAL_ACCESS_TOKEN=/);
});

test('docs and installers point to renamed 0-1-CLI repository', () => {
  const combined = [
    readFileSync('README.md', 'utf8'),
    readFileSync('README_zh-CN.md', 'utf8'),
    readFileSync('scripts/install.ps1', 'utf8'),
    readFileSync('scripts/install.sh', 'utf8'),
  ].join('\n');

  assert.match(combined, /AIMFllyYS\/0-1-CLI/);
  assert.doesNotMatch(combined, /AIMFllyYS\/My-Windows-CLI/);
});
