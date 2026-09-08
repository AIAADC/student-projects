const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('system prompt is composed from mode tools environment and repo instructions', () => {
  const { buildSystemPrompt } = require('../dist/chat/prompt');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-prompt-'));
  fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), '注意禁止弄坏中文\n任务每完成一个阶段进行本地commit\n', 'utf8');

  const prompt = buildSystemPrompt({
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    modelId: 'model-a',
    toolNames: ['read_file', 'write_file', 'shell'],
  });

  assert.match(prompt, /# Identity/);
  assert.match(prompt, /# Mode/);
  assert.match(prompt, /agent mode/i);
  assert.match(prompt, /permission mode: ask/i);
  assert.match(prompt, /read_file/);
  assert.match(prompt, /write_file/);
  assert.match(prompt, /shell/);
  assert.match(prompt, /# Project Instructions/);
  assert.match(prompt, /注意禁止弄坏中文/);
  assert.match(prompt, /每完成一个阶段/);
  assert.match(prompt, /# Environment/);
  assert.match(prompt, new RegExp(workspaceRoot.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')));
});

test('mode prompt rules keep chat read-only and plan non-mutating', () => {
  const { buildModePromptSection } = require('../dist/chat/prompt');

  const chat = buildModePromptSection('chat', 'ask');
  const plan = buildModePromptSection('plan', 'plan');
  const agent = buildModePromptSection('agent', 'bypass');

  assert.match(chat, /read-only/i);
  assert.match(chat, /do not write/i);
  assert.match(plan, /do not edit/i);
  assert.match(plan, /plan/i);
  assert.match(agent, /can edit/i);
  assert.match(agent, /bypass/i);
});

test('plan and agent mode prompts include Claude-style operating contracts', () => {
  const { buildModePromptSection } = require('../dist/chat/prompt');

  const plan = buildModePromptSection('plan', 'plan');
  const agentAsk = buildModePromptSection('agent', 'ask');

  assert.match(plan, /Plan Format/);
  assert.match(plan, /Goal/);
  assert.match(plan, /Steps/);
  assert.match(plan, /Risks/);
  assert.match(plan, /Verification/);
  assert.match(plan, /Do not execute/i);
  assert.match(plan, /ask clarifying questions/i);
  assert.match(plan, /exit_plan_mode/);
  assert.match(plan, /permissions/i);

  assert.match(agentAsk, /Execution Loop/);
  assert.match(agentAsk, /Inspect/);
  assert.match(agentAsk, /Edit/);
  assert.match(agentAsk, /Verify/);
  assert.match(agentAsk, /Report/);
  assert.match(agentAsk, /permission engine/i);
});

test('tool prompt describes Claude-style task delegation without account behavior', () => {
  const { buildSystemPrompt } = require('../dist/chat/prompt');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-prompt-task-'));
  const prompt = buildSystemPrompt({
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    modelId: 'model-a',
    toolNames: ['read_file', 'task'],
  });

  assert.match(prompt, /task/);
  assert.match(prompt, /subagent/i);
  assert.match(prompt, /description/);
  assert.match(prompt, /prompt/);
  assert.doesNotMatch(prompt, /oauth|login|logout|telemetry|analytics|subscription|anthropic account/i);
});

test('chat runtime prompt defaults to provider tools for the active mode', () => {
  const source = require('node:fs').readFileSync('src/chat/tools.ts', 'utf8');

  assert.match(source, /buildProviderToolSpecs/);
  assert.match(source, /toolNames:\s*options\.toolNames\s*\|\|/);
});

test('repo instruction loader preserves UTF-8 and bounds file size', () => {
  const { loadRepoInstructions } = require('../dist/chat/prompt');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-prompt-repo-'));
  fs.writeFileSync(path.join(workspaceRoot, 'CLAUDE.md'), '中文说明\n' + 'A'.repeat(20000), 'utf8');

  const instructions = loadRepoInstructions(workspaceRoot, { maxCharsPerFile: 512 });

  assert.equal(instructions.length, 1);
  assert.equal(instructions[0].file, 'CLAUDE.md');
  assert.match(instructions[0].content, /中文说明/);
  assert.ok(instructions[0].content.length < 700);
  assert.equal(instructions[0].truncated, true);
});

test('system prompt does not import Claude account telemetry or login behavior', () => {
  const { buildSystemPrompt } = require('../dist/chat/prompt');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-prompt-safe-'));
  const prompt = buildSystemPrompt({
    workspaceRoot,
    mode: 'chat',
    permissionMode: 'ask',
    modelId: 'model-a',
    toolNames: ['read_file'],
  });

  assert.doesNotMatch(prompt, /oauth|login|logout|telemetry|analytics|subscription|anthropic account/i);
});

test('markdown renderer preserves Chinese text with colors disabled', () => {
  const { renderMarkdown } = require('../dist/chat/markdown');
  const { setColorEnabled } = require('../dist/chat/ui/theme');

  setColorEnabled(false);
  try {
    const output = renderMarkdown('## 计划\n\n- 保留 UTF-8 中文\n- **加粗**说明');
    assert.equal(output.includes('\x1B['), false);
    assert.match(output, /计划/);
    assert.match(output, /保留 UTF-8 中文/);
    assert.match(output, /加粗/);
  } finally {
    setColorEnabled(true);
  }
});
