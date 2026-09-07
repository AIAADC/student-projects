const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('parsePartialPath splits directory and prefix from partial input', () => {
  const { parsePartialPath } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const empty = parsePartialPath('', root);
  assert.equal(empty.directory, root);
  assert.equal(empty.prefix, '');

  const withSlash = parsePartialPath('src/', root);
  assert.equal(withSlash.directory, path.resolve(root, 'src'));
  assert.equal(withSlash.prefix, '');

  const withPrefix = parsePartialPath('src/ch', root);
  assert.equal(withPrefix.directory, path.resolve(root, 'src'));
  assert.equal(withPrefix.prefix, 'ch');
});

test('isPathLikeToken detects path-like input strings', () => {
  const { isPathLikeToken } = require('../dist/chat/path-completion');

  assert.equal(isPathLikeToken('./src'), true);
  assert.equal(isPathLikeToken('../parent'), true);
  assert.equal(isPathLikeToken('.'), true);
  assert.equal(isPathLikeToken('..'), true);
  assert.equal(isPathLikeToken('src/'), true);
  assert.equal(isPathLikeToken('hello'), false);
  assert.equal(isPathLikeToken('/chat'), false, 'slash commands should not be path-like');
});

test('isWithinWorkspace blocks paths that escape the workspace root', () => {
  const { isWithinWorkspace } = require('../dist/chat/path-completion');
  const root = process.cwd();

  assert.equal(isWithinWorkspace(path.join(root, 'src'), root), true);
  assert.equal(isWithinWorkspace(path.join(root, 'src', 'chat'), root), true);
  assert.equal(isWithinWorkspace(root, root), true);
  assert.equal(isWithinWorkspace(path.resolve(root, '..'), root), false);
  assert.equal(isWithinWorkspace(path.resolve(root, '..', 'other'), root), false);
});

test('isWithinWorkspace handles Windows absolute paths outside workspace', () => {
  const { isWithinWorkspace } = require('../dist/chat/path-completion');

  assert.equal(isWithinWorkspace('C:\\Windows\\System32', 'D:\\new_project\\My-CLI'), false);
  assert.equal(isWithinWorkspace('D:\\new_project\\My-CLI\\src', 'D:\\new_project\\My-CLI'), true);
});

test('getPathSuggestions returns directory entries within workspace', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const results = await getPathSuggestions('src/', root, { maxResults: 20 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, 'src/ should contain entries');
  assert.ok(results.every((item) => item.id && item.displayText && item.source === 'path'));

  const dirEntries = results.filter((item) => item.displayText.endsWith('/'));
  assert.ok(dirEntries.length > 0, 'Should include directory entries with trailing slash');
});

test('getPathSuggestions returns empty for paths outside workspace', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const outside = await getPathSuggestions('../../', root, { maxResults: 20 });
  assert.equal(outside.length, 0, 'Must deny traversal outside workspace root');
});

test('getPathSuggestions respects maxResults cap', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const capped = await getPathSuggestions('', root, { maxResults: 3 });
  assert.ok(capped.length <= 3, 'Must respect maxResults cap');
});

test('getPathSuggestions ranks directories before files', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const results = await getPathSuggestions('', root, { maxResults: 50 });
  if (results.length > 1) {
    const firstFileIdx = results.findIndex((item) => !item.displayText.endsWith('/'));
    const lastDirIdx = results.map((item, idx) => item.displayText.endsWith('/') ? idx : -1).filter((i) => i >= 0).pop();
    if (firstFileIdx >= 0 && lastDirIdx !== undefined && lastDirIdx >= 0) {
      assert.ok(lastDirIdx < firstFileIdx, 'Directories should come before files');
    }
  }
});

test('Chinese file names survive path completion round-trip', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycli-test-'));
  const chineseDir = path.join(tmpDir, '中文目录');
  const chineseFile = path.join(tmpDir, '测试文件.txt');
  fs.mkdirSync(chineseDir);
  fs.writeFileSync(chineseFile, '内容', 'utf8');

  try {
    const results = await getPathSuggestions('', tmpDir, { maxResults: 20 });
    const names = results.map((item) => item.displayText);
    assert.ok(names.some((name) => name.includes('中文目录')), 'Chinese directory name must survive');
    assert.ok(names.some((name) => name.includes('测试文件')), 'Chinese file name must survive');
    assert.ok(!names.join('').includes('\uFFFD'), 'No replacement characters');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('normalizeToForwardSlash converts backslashes on Windows paths', () => {
  const { normalizeToForwardSlash } = require('../dist/chat/path-completion');

  assert.equal(normalizeToForwardSlash('src\\chat\\index.ts'), 'src/chat/index.ts');
  assert.equal(normalizeToForwardSlash('src/chat/index.ts'), 'src/chat/index.ts');
});

test('path completion does not expose account, telemetry, or login data', async () => {
  const { getPathSuggestions } = require('../dist/chat/path-completion');
  const root = process.cwd();

  const results = await getPathSuggestions('', root, { maxResults: 50 });
  const json = JSON.stringify(results).toLowerCase();
  assert.doesNotMatch(json, /telemetry|analytics|oauth|subscription|billing/);
});
