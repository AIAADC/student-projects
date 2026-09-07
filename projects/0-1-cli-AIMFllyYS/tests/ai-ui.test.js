const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

function charVisibleWidth(char) {
  const code = char.codePointAt(0) ?? 0;
  if (code <= 0xff) return 1;
  if (code >= 0x2500 && code <= 0x257f) return 1;
  if (code === 0x25c6 || code === 0x25c7 || code === 0x2022) return 1;
  return 2;
}

function visibleLength(value) {
  return Array.from(stripAnsi(value)).reduce((sum, char) => sum + charVisibleWidth(char), 0);
}

const REPLACEMENT = '\uFFFD';
const MOJIBAKE_FRAGMENTS = /鏃|璇|鎶|瀛|鈥|鈼/;

function assertNoMojibake(text, label) {
  const plain = stripAnsi(text);
  assert.ok(!plain.includes(REPLACEMENT), `${label} contains replacement char U+FFFD`);
  assert.doesNotMatch(plain, MOJIBAKE_FRAGMENTS, `${label} contains mojibake fragment`);
}

test('status header includes project mode model permission and UTF-8 labels', () => {
  const { renderStatusHeader } = require('../dist/chat/ui/layout');
  const raw = renderStatusHeader({
    project: 'My-CLI-很长很长很长很长很长很长',
    mode: 'agent',
    permissionMode: 'ask',
    model: 'glm-4.5-super-long-model-name',
    activeSkills: 2,
    runningSubagents: 1,
  });
  const output = stripAnsi(raw);

  assert.match(output, /0-1 CLI/);
  assert.match(output, /My-CLI/);
  assert.match(output, /\[A Agent\]/);
  assert.match(output, /asks before tools/);
  assert.match(output, /glm-4\.5/);
  assert.match(output, /技能 2/);
  assert.match(output, /子任务 1/);
  assertNoMojibake(raw, 'status header');
  for (const line of raw.split('\n').filter(Boolean)) {
    assert.ok(visibleLength(line) <= 66, `line too wide: ${stripAnsi(line)}`);
  }
});

test('permission box renders clear action labels', () => {
  const { renderPermissionBox } = require('../dist/chat/ui/layout');
  const output = stripAnsi(renderPermissionBox({ tool: 'write_file', action: 'ask', reason: 'agent mode requires confirmation' }));

  assert.match(output, /Permission/);
  assert.match(output, /write_file/);
  assert.match(output, /允许/);
  assert.match(output, /拒绝/);
  assert.match(output, /ASK/);
  assertNoMojibake(output, 'permission box');
});

test('plan approval panel renders Claude-style ready-to-code review', () => {
  const { renderPlanApprovalPanel } = require('../dist/chat/ui/layout');
  const output = stripAnsi(renderPlanApprovalPanel({
    plan: 'Goal: 保留 UTF-8 中文\nSteps:\n- implement safely',
    planFilePath: 'D:\\workspace\\.0-1-cli\\plans\\current.md',
    permissions: [{ action: 'edit files', reason: 'implement plan' }],
  }));

  assert.match(output, /Ready to code\?/);
  assert.match(output, /Here is 0-1 CLI's plan:/);
  assert.match(output, /Goal: 保留 UTF-8 中文/);
  assert.match(output, /Requested permissions:/);
  assert.match(output, /edit files: implement plan/);
  assert.match(output, /Yes, manually approve edits/);
  assert.match(output, /No, keep planning/);
  assert.match(output, /Plan file:/);
  assert.match(output, /not auto-granted/i);
  assertNoMojibake(output, 'plan approval panel');
});

test('plan approval panel keeps wide plan content within status width', () => {
  const { renderPlanApprovalPanel } = require('../dist/chat/ui/layout');
  const raw = renderPlanApprovalPanel({
    plan: `Goal: ${'保留中文'.repeat(30)}\nSteps:\n- ${'verify '.repeat(40)}`,
    permissions: [{ action: 'edit files' }],
  });

  for (const line of raw.split('\n').filter(Boolean)) {
    assert.ok(visibleLength(line) <= 66, `line too wide: ${stripAnsi(line)}`);
  }
});

test('timeline entries render tool and subagent activity', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');

  const read = stripAnsi(renderTimelineEntry({ kind: 'tool', status: 'completed', label: 'read_file', detail: 'README.md' }));
  const shell = stripAnsi(renderTimelineEntry({ kind: 'tool', status: 'failed', label: 'shell', detail: 'npm test' }));
  const subagent = stripAnsi(renderTimelineEntry({ kind: 'subagent', status: 'running', label: 'sub-1', detail: 'Review files' }));

  assert.match(read, /read_file/);
  assert.match(read, /completed/);
  assert.match(shell, /shell/);
  assert.match(shell, /failed/);
  assert.match(subagent, /sub-1/);
  assert.match(subagent, /running/);
});

test('thinking state line renders model mode detail and stays within width', () => {
  const { renderThinkingState } = require('../dist/chat/ui/layout');
  const output = renderThinkingState({
    label: 'Agent',
    status: 'reasoning',
    model: 'glm-4.5-super-long-model-name',
    mode: 'agent',
    detail: 'planning tool calls and permissions while preserving UTF-8 中文',
  });
  const plain = stripAnsi(output);

  assert.match(plain, /Agent/);
  assert.match(plain, /reasoning/);
  assert.match(plain, /glm-4\.5/);
  assert.match(plain, /agent/);
  assert.match(plain, /UTF-8 中文/);
  assertNoMojibake(output, 'thinking state');
  assert.ok(visibleLength(output) <= 66, `thinking line too wide: ${plain}`);
});

test('agent progress events render live tool and waiting state lines', () => {
  const { renderAgentProgressEvent } = require('../dist/chat/ui/layout');

  const running = renderAgentProgressEvent({
    event: { type: 'tool_start', round: 1, toolName: 'read_file', toolCallId: 'call-1' },
    mode: 'agent',
    model: 'glm-4.5-super-long-model-name',
  });
  const completed = renderAgentProgressEvent({
    event: {
      type: 'tool_result',
      round: 1,
      toolName: 'read_file',
      toolCallId: 'call-1',
      permissionDecision: 'allow',
      contentPreview: 'README.md loaded with UTF-8 中文',
    },
    mode: 'agent',
    model: 'glm-4.5-super-long-model-name',
  });
  const waiting = renderAgentProgressEvent({
    event: {
      type: 'permission_required',
      round: 1,
      toolName: 'write_file',
      toolCallId: 'call-2',
      reason: 'write requires confirmation',
    },
    mode: 'agent',
  });

  assert.match(stripAnsi(running), /read_file/);
  assert.match(stripAnsi(running), /running/);
  assert.match(stripAnsi(completed), /completed/);
  assert.match(stripAnsi(completed), /UTF-8 中文/);
  assert.match(stripAnsi(waiting), /waiting/);
  assert.match(stripAnsi(waiting), /write_file/);
  assertNoMojibake(running + completed + waiting, 'agent progress events');
  for (const line of [running, completed, waiting]) {
    assert.ok(visibleLength(line) <= 66, `agent progress line too wide: ${stripAnsi(line)}`);
  }
});

test('subagent timeline entry renders queued completed failed and cancelled rows with metrics', () => {
  const { renderSubagentTimelineEntry } = require('../dist/chat/ui/layout');

  const queued = stripAnsi(renderSubagentTimelineEntry({
    id: 'sub-1',
    status: 'queued',
    prompt: 'Review files',
  }));
  const running = stripAnsi(renderSubagentTimelineEntry({
    id: 'sub-2',
    status: 'running',
    prompt: 'Inspect auth',
  }));
  const completed = stripAnsi(renderSubagentTimelineEntry({
    id: 'sub-3',
    status: 'completed',
    prompt: 'Verify renderer',
    summary: 'Done',
    toolCount: 2,
    permissionCount: 1,
    elapsedMs: 1200,
  }));
  const failed = stripAnsi(renderSubagentTimelineEntry({
    id: 'sub-4',
    status: 'failed',
    prompt: 'Broken task',
    error: 'Permission denied',
  }));
  const cancelled = stripAnsi(renderSubagentTimelineEntry({
    id: 'sub-5',
    status: 'cancelled',
    prompt: 'Stopped task',
    summary: 'Stopped early',
  }));

  assert.match(queued, /sub-1/);
  assert.match(queued, /queued/);
  assert.match(running, /running/);
  assert.match(completed, /completed/);
  assert.match(completed, /tools=2/);
  assert.match(completed, /permissions=1/);
  assert.match(completed, /1200ms/);
  assert.match(failed, /failed/);
  assert.match(failed, /Permission denied/);
  assert.match(cancelled, /cancelled/);
  assert.match(cancelled, /Stopped early/);
});

test('timeline truncation does not cut ANSI escape sequences', () => {
  const chalk = require('chalk');
  const { setColorEnabled } = require('../dist/chat/ui/theme');
  const previousLevel = chalk.level;
  setColorEnabled(true);
  chalk.level = 1;
  try {
    const { renderTimelineEntry } = require('../dist/chat/ui/layout');
    const output = renderTimelineEntry({
      kind: 'subagent',
      status: 'running',
      label: 'sub-very-long',
      detail: 'x'.repeat(300),
    });

    assert.doesNotMatch(output, /\x1B\[[0-?]*[ -/]*$/);
    assert.match(output, /\x1B\[/);
  } finally {
    chalk.level = previousLevel;
    setColorEnabled(!process.env.NO_COLOR);
  }
});

test('timeline truncates long wide labels within width', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');
  const output = renderTimelineEntry({
    kind: 'subagent',
    status: 'running',
    label: '子任务'.repeat(40),
    detail: '审查文件'.repeat(40),
  });

  assert.ok(visibleLength(output) <= 66, `line too wide: ${stripAnsi(output)}`);
  assert.match(stripAnsi(output), /…/);
});

test('timeline truncates long ASCII labels within width', () => {
  const { renderTimelineEntry } = require('../dist/chat/ui/layout');
  const output = renderTimelineEntry({
    kind: 'tool',
    status: 'completed',
    label: 'very-long-ascii-label-that-keeps-going',
    detail: 'ascii-detail-'.repeat(40),
  });

  assert.ok(visibleLength(output) <= 66, `line too wide: ${stripAnsi(output)}`);
  assert.match(stripAnsi(output), /…/);
});

test('permission box formatter is wired into chat runtime', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /formatPermissionDecision/);
  assert.match(source, /renderPlanApprovalPanel/);
  assert.match(source, /renderAgentProgressEvent/);
  assert.match(source, /renderThinkingState/);
  assert.match(source, /onEvent:\s*\(event\)/);
  assert.match(source, /subagent runs in/);
});

test('mode pill renders all modes without exceeding status width', () => {
  const { renderModePill } = require('../dist/chat/ui/layout');

  for (const mode of ['chat', 'agent', 'plan']) {
    const output = renderModePill(mode, mode === 'agent' ? 'ask' : mode === 'plan' ? 'plan' : 'ask');
    const plain = stripAnsi(output);
    assert.match(plain, /^\[[CAP] /);
    assert.ok(visibleLength(output) <= 28, `mode pill too wide: ${plain}`);
  }
});

test('slash menu exposes mode and runtime commands with Skills group', () => {
  const { formatSlashMenu, getSlashMenuItems } = require('../dist/chat/commands');

  const chatMenu = formatSlashMenu('chat');
  const agentMenu = formatSlashMenu('agent');
  const agentItems = getSlashMenuItems('agent').map((item) => item.command);

  assert.match(chatMenu, /\/chat/);
  assert.match(chatMenu, /\/plan open/);
  assert.match(chatMenu, /\/setting/);
  assert.doesNotMatch(chatMenu, /\/agent spawn <task>/);
  assert.ok(agentItems.includes('/agent spawn <task>'));
  assert.ok(agentItems.includes('/skills'));
  assert.match(agentMenu, /Skills/);
  assert.match(agentMenu, /\/skills/);
  assert.match(agentMenu, /\/skill <id\|name>/);
});

test('slash menu groups commands with Claude-style source metadata and Skills category', () => {
  const {
    formatDescriptionWithSource,
    formatSlashMenu,
    getSlashCommandDefinitions,
  } = require('../dist/chat/commands');

  const menu = formatSlashMenu('agent');
  const definitions = getSlashCommandDefinitions('agent');
  const spawn = definitions.find((item) => item.command === '/agent spawn <task>');
  const skill = definitions.find((item) => item.command === '/skill <id|name>');
  const skills = definitions.find((item) => item.command === '/skills');

  assert.match(menu, /Mode/);
  assert.match(menu, /Agent/);
  assert.match(menu, /Runtime/);
  assert.match(menu, /Skills/);
  assert.match(menu, /\[builtin\]/);
  assert.equal(spawn.category, 'Agent');
  assert.equal(spawn.loadedFrom, 'builtin');
  assert.equal(spawn.argumentHint, '<task>');
  assert.equal(skill.category, 'Skills');
  assert.equal(skills.category, 'Skills');
  assert.equal(formatDescriptionWithSource(spawn), 'Start a scoped local subagent [builtin]');
});

test('slash command registry supports aliases arguments and hidden filtering', () => {
  const {
    getSlashCommandDefinitions,
    parseSlashCommand,
    resolveSlashCommand,
  } = require('../dist/chat/commands');

  const definitions = getSlashCommandDefinitions('agent');
  const help = definitions.find((item) => item.command === '/help');
  const exit = definitions.find((item) => item.command === '/exit');
  const setting = definitions.find((item) => item.command === '/setting');
  const hidden = definitions.filter((item) => item.isHidden);

  assert.deepEqual(resolveSlashCommand('/h'), { command: '/help', args: '', rawCommand: '/h' });
  assert.deepEqual(resolveSlashCommand('/settings'), { command: '/setting', args: '', rawCommand: '/settings' });
  assert.deepEqual(resolveSlashCommand('/m glm-4.5'), { command: '/model', args: 'glm-4.5', rawCommand: '/m' });
  assert.equal(resolveSlashCommand('/missing'), null);
  assert.deepEqual(parseSlashCommand('/missing value'), { command: '/missing', args: 'value' });
  assert.ok(help.aliases.includes('/h'));
  assert.ok(exit.aliases.includes('/q'));
  assert.equal(setting.argumentHint, 'URL / API Key / Model IDs');
  assert.equal(hidden.length, 0);
});

test('chat runtime wires agent mode through tool-call loop', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /runAgentTurn/);
  assert.match(source, /chatCompleteMessage/);
  assert.match(source, /buildProviderToolSpecs\(session\.mode\)/);
  assert.match(source, /session\.mode === 'agent'/);
});

test('chat runtime wires permission dialog choices into agent ask mode', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /formatPermissionPromptOptions/);
  assert.match(source, /parsePermissionPromptChoice/);
  assert.match(source, /applyPermissionPromptChoice/);
  assert.match(source, /permissionSession/);
  assert.match(source, /askLine/);
});

test('chat runtime wires mode-cycle shortcuts into the keypress handler', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /getNextMode/);
  assert.match(source, /cycleMode/);
  assert.match(source, /shift/);
  assert.match(source, /meta/);
});

test('keyboard hint row renders navigational shortcuts without exceeding status width', () => {
  const { renderKeyboardHintRow } = require('../dist/chat/ui/layout');

  const output = stripAnsi(renderKeyboardHintRow());

  assert.match(output, /Esc/);
  assert.match(output, /Tab/);
  assert.match(output, /Enter/);
  assert.match(output, /navigate/);
  assert.ok(visibleLength(output) <= 66, `hint row too wide: ${output}`);
});

test('theme divider and panels share divider glyph grammar', () => {
  const { divider, panelDivider } = require('../dist/chat/ui/theme');
  const { setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('unicode');
  assert.match(stripAnsi(divider(20)), /─{20}/);
  assert.match(stripAnsi(panelDivider()), /─{48}/);

  setGlyphMode('ascii');
  assert.match(stripAnsi(divider(12)), /-{12}/);
});

test('renderByline joins keyboard hints with middot separator', () => {
  const { renderByline, renderKeyboardHint } = require('../dist/chat/ui/theme');
  const { setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('unicode');
  const output = stripAnsi(renderByline([
    renderKeyboardHint('Enter', 'confirm', { bold: true }),
    renderKeyboardHint('Esc', 'cancel'),
  ]));

  assert.match(output, /Enter to confirm · Esc to cancel/);
});

test('color disabled output stays readable without ANSI styling', () => {
  const { setColorEnabled, divider } = require('../dist/chat/ui/theme');
  const { renderPermissionBox, renderPlanApprovalPanel } = require('../dist/chat/ui/layout');

  setColorEnabled(false);
  try {
    const permission = renderPermissionBox({
      tool: 'read_file',
      action: 'ask',
      reason: 'agent mode requires confirmation',
    });
    const plan = renderPlanApprovalPanel({ plan: 'Goal: 保留 UTF-8 中文' });

    assert.equal(permission.includes('\x1B['), false);
    assert.equal(plan.includes('\x1B['), false);
    assert.match(permission, /Permission/);
    assert.match(permission, /read_file/);
    assert.match(plan, /Ready to code\?/);
    assert.match(plan, /保留 UTF-8 中文/);
    assert.match(stripAnsi(divider(10)), /-{10}|─{10}/);
  } finally {
    setColorEnabled(true);
  }
});

test('assistant answer header and markdown share divider grammar', () => {
  const { renderAssistantHeader } = require('../dist/chat/ui/theme');
  const { renderMarkdown } = require('../dist/chat/markdown');

  const header = stripAnsi(renderAssistantHeader());
  const markdown = stripAnsi(renderMarkdown('## Section\n\n---\n\nHello 中文'));

  assert.match(header, /AI/);
  assert.match(header, /─{10,}/);
  assert.match(markdown, /─{10,}/);
  assert.match(markdown, /Section/);
  assert.match(markdown, /Hello 中文/);
});

test('spinner uses ascii-safe frames when glyph mode is ascii', () => {
  const { Spinner } = require('../dist/chat/spinner');
  const { setGlyphMode } = require('../dist/chat/terminal-ui');

  setGlyphMode('ascii');
  const frames = Spinner.getFrames();
  assert.ok(frames.length >= 4);
  assert.ok(frames.every((frame) => /^[\|/\\-]$/.test(frame)));
});
