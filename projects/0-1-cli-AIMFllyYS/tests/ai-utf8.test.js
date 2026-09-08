const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

const REPLACEMENT = '\uFFFD';
const MOJIBAKE_FRAGMENTS = /鏃|璇|鎶|瀛|鈥|鈼/;

function assertNoMojibake(text, label) {
  const plain = stripAnsi(text);
  assert.ok(!plain.includes(REPLACEMENT), `${label} contains replacement char U+FFFD`);
  assert.doesNotMatch(plain, MOJIBAKE_FRAGMENTS, `${label} contains mojibake fragment`);
}

// -- Chinese text round-trip --

test('provider error messages contain valid Chinese', () => {
  const providerSrc = fs.readFileSync('src/chat/provider.ts', 'utf8');
  assert.match(providerSrc, /未配置/);
  assert.match(providerSrc, /请检查/);
  assert.match(providerSrc, /请求超时/);
  assert.match(providerSrc, /响应解析失败/);
  assertNoMojibake(providerSrc, 'provider.ts source');
});

test('layout Chinese labels round-trip through render', () => {
  const { renderStatusHeader, renderPermissionBox } = require('../dist/chat/ui/layout');

  const header = renderStatusHeader({
    project: '测试项目',
    mode: 'agent',
    permissionMode: 'ask',
    model: 'test-model',
    activeSkills: 1,
    runningSubagents: 0,
  });
  const box = renderPermissionBox({
    tool: 'write_file',
    action: 'ask',
    reason: '需要确认',
  });

  const headerPlain = stripAnsi(header);
  const boxPlain = stripAnsi(box);
  assert.match(headerPlain, /技能 1/);
  assert.match(headerPlain, /子任务 0/);
  assert.match(boxPlain, /允许/);
  assert.match(boxPlain, /拒绝/);
  assertNoMojibake(header, 'status header');
  assertNoMojibake(box, 'permission box');
});

test('Windows path with Chinese characters survives truncation', () => {
  const { truncateVisible, visibleLength } = require('../dist/chat/ui/theme');

  const path = 'D:\\用户\\桌面\\项目\\My-CLI\\src\\测试文件.ts';
  const truncated = truncateVisible(path, 30);
  assertNoMojibake(truncated, 'truncated Chinese path');
  assert.ok(visibleLength(truncated) <= 30, 'truncated path exceeds max width');
  assert.match(truncated, /D:\\用户/);
});

test('Chinese project name in status header survives truncation', () => {
  const { renderStatusHeader } = require('../dist/chat/ui/layout');

  const header = renderStatusHeader({
    project: '我的超级长长长长长长的项目名称需要被截断',
    mode: 'chat',
    permissionMode: 'ask',
    model: 'test',
  });

  assertNoMojibake(header, 'header with long Chinese project');
  assert.match(stripAnsi(header), /我的超级/);
});

// -- Glyph fallback system --

test('glyph registry exports unicode and ascii variants', () => {
  const { glyphs, setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('unicode');
  assert.equal(glyphs.success, '✓');
  assert.equal(glyphs.error, '✗');
  assert.equal(glyphs.info, 'ℹ');
  assert.equal(glyphs.warning, '⚠');
  assert.equal(glyphs.separator, '·');
  assert.equal(glyphs.pointer, '›');

  setGlyphMode('ascii');
  assert.equal(glyphs.success, 'v');
  assert.equal(glyphs.error, 'x');
  assert.equal(glyphs.info, 'i');
  assert.equal(glyphs.warning, '!');
  assert.equal(glyphs.separator, '-');
  assert.equal(glyphs.pointer, '>');

  setGlyphMode('unicode');
});

test('box drawing functions use glyphs from registry', () => {
  const { drawBox, setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('unicode');
  const unicodeBox = stripAnsi(drawBox('Title'));
  assert.match(unicodeBox, /[╔═╗║╚╝]/);

  setGlyphMode('ascii');
  const asciiBox = stripAnsi(drawBox('Title'));
  assert.doesNotMatch(asciiBox, /[╔═╗║╚╝]/);
  assert.match(asciiBox, /[+\-|]/);

  setGlyphMode('unicode');
});

test('status message functions use glyph registry', () => {
  const { setGlyphMode, printSuccess, printError, printInfo, printWarning } = require('../dist/chat/terminal-ui');
  const original = console.log;
  const lines = [];
  console.log = (msg) => lines.push(msg);
  try {
    setGlyphMode('ascii');
    printSuccess('ok');
    printError('fail');
    printInfo('note');
    printWarning('warn');
    const output = lines.map(stripAnsi).join('\n');
    assert.match(output, /v ok/);
    assert.match(output, /x fail/);
    assert.match(output, /i note/);
    assert.match(output, /! warn/);
    assert.doesNotMatch(output, /[✓✗ℹ⚠]/);

    lines.length = 0;
    setGlyphMode('unicode');
    printSuccess('ok');
    const unicodeOutput = stripAnsi(lines[0]);
    assert.match(unicodeOutput, /✓/);
  } finally {
    console.log = original;
    setGlyphMode('unicode');
  }
});

test('timeline entry glyphs respect glyph mode', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');
  const { setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('ascii');
  const ascii = stripAnsi(renderTimelineEntry({
    kind: 'subagent', status: 'running', label: 'sub-1', detail: 'review',
  }));
  assert.doesNotMatch(ascii, /[◇◆•]/);

  setGlyphMode('unicode');
  const unicode = stripAnsi(renderTimelineEntry({
    kind: 'subagent', status: 'running', label: 'sub-1', detail: 'review',
  }));
  assert.match(unicode, /[◇◆•]/);
});

// -- No replacement chars in any rendered output --

test('all layout renderers produce no replacement characters', () => {
  const layout = require('../dist/chat/ui/layout');

  const outputs = [
    layout.renderStatusHeader({
      project: '项目', mode: 'agent', permissionMode: 'ask', model: 'test',
    }),
    layout.renderPermissionBox({ tool: 'shell', action: 'allow', reason: '安全操作' }),
    layout.renderPlanApprovalPanel({ plan: '计划内容\n步骤一\n步骤二' }),
    layout.renderTimelineEntry({ kind: 'tool', status: 'completed', label: '读文件', detail: '成功' }),
    layout.renderKeyboardHintRow(),
  ];

  for (const output of outputs) {
    assertNoMojibake(output, 'layout renderer output');
  }
});
