const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const FORBIDDEN = /\b(telemetry|analytics|OpenTelemetry|Statsig|GrowthBook|login|logout|oauth|subscription|billing|entitlement|account)\b/i;

function listRuntimeFiles() {
  return execFileSync('rg', ['--files', 'src', 'desktop/src', '--glob', '*.ts', '--glob', '*.tsx'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .map((file) => file.replace(/\\/g, '/'))
    .sort();
}

function isAllowedHit(file, line) {
  if (file.startsWith('src/modules/github/')) return true;
  if (file === 'src/index.ts' && /\bgh-accounts\b|GitHub accounts|displayAccounts|opts\.ghAccounts/.test(line)) return true;
  return false;
}

test('runtime forbidden-port scan has only GitHub auth helper hits', () => {
  const hits = [];
  for (const file of listRuntimeFiles()) {
    const content = readFileSync(file, 'utf8');
    content.split(/\r?\n/).forEach((line, index) => {
      if (!FORBIDDEN.test(line)) return;
      if (isAllowedHit(file, line)) return;
      hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }

  assert.deepEqual(hits, [], `unexpected forbidden-port runtime hits:\n${hits.join('\n')}`);
});
