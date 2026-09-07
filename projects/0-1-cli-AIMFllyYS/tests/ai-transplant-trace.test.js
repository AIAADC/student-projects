const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

function listChatSourceFiles() {
  return execFileSync('rg', ['--files', 'src/chat', '--glob', '*.ts'], { encoding: 'utf8' })
    .trim()
    .split(/\r?\n/)
    .map((file) => file.replace(/\\/g, '/'))
    .sort();
}

function parseTraceMatrix(markdown) {
  const rows = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('| `src/chat/')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 3) continue;
    const file = cells[0].replace(/^`|`$/g, '');
    rows.set(file, {
      source: cells[1],
      note: cells[2],
    });
  }
  return rows;
}

test('Claude source transplant map covers every src/chat TypeScript module', () => {
  const sourceFiles = listChatSourceFiles();
  const map = readFileSync('docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md', 'utf8');
  const rows = parseTraceMatrix(map);

  const missing = sourceFiles.filter((file) => !rows.has(file));
  assert.deepEqual(missing, [], `missing transplant trace rows:\n${missing.join('\n')}`);

  for (const file of sourceFiles) {
    const row = rows.get(file);
    assert.match(row.source, /`src\//, `${file} must reference at least one Claude source path`);
    assert.doesNotMatch(row.source, /login|logout|oauth|billing|entitlement|subscription|telemetry|analytics|Statsig|GrowthBook|remoteBridge|trustedDevice/i);
    assert.ok(row.note.length >= 12, `${file} must explain the adaptation boundary`);
  }
});
