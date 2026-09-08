const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readFileSync } = fs;
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('session starts in chat ask mode by default', () => {
  const { createSessionState } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'deepseek-v4-flash', autoAccept: false });

  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');
  assert.equal(state.currentModelId, 'deepseek-v4-flash');
});

test('auto accept starts in agent bypass mode', () => {
  const { createSessionState } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'custom-model', autoAccept: true });

  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'bypass');
  assert.equal(state.currentModelId, 'custom-model');
});

test('mode transitions update permission mode without losing model', () => {
  const { createSessionState, setMode } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: false });

  setMode(state, 'plan');
  assert.equal(state.mode, 'plan');
  assert.equal(state.permissionMode, 'plan');
  assert.equal(state.currentModelId, 'model-a');

  setMode(state, 'agent');
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'chat');
  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');
});

test('auto accept only keeps bypass in agent mode', () => {
  const { createSessionState, setMode } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: true });

  setMode(state, 'chat');
  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'plan');
  assert.equal(state.mode, 'plan');
  assert.equal(state.permissionMode, 'plan');

  setMode(state, 'agent');
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'bypass');
});

test('plan mode stores and formats the current plan', () => {
  const { createSessionState, formatCurrentPlan, recordCurrentPlan } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: false });

  assert.match(formatCurrentPlan(state), /No current plan/);

  recordCurrentPlan(state, '  Goal: ship desktop release assets\nSteps:\n- verify builds  ');

  assert.equal(state.currentPlan, 'Goal: ship desktop release assets\nSteps:\n- verify builds');
  assert.match(formatCurrentPlan(state), /Goal: ship desktop release assets/);

  recordCurrentPlan(state, '   ');
  assert.equal(state.currentPlan, 'Goal: ship desktop release assets\nSteps:\n- verify builds');
});

test('plan mode persists current plan to workspace plan file', () => {
  const { createSessionState, formatCurrentPlan, loadCurrentPlanFromWorkspace, recordCurrentPlan } = require('../dist/chat/session');
  const { getCurrentPlanPath, readCurrentPlanFile } = require('../dist/chat/plan-store');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-plan-store-'));
  const state = createSessionState({ modelId: 'model-a', autoAccept: false });

  recordCurrentPlan(state, '  Goal: 保留 UTF-8 中文\nSteps:\n- write plan file  ', { workspaceRoot });

  const expectedPath = path.join(workspaceRoot, '.0-1-cli', 'plans', 'current.md');
  assert.equal(getCurrentPlanPath(workspaceRoot), expectedPath);
  assert.equal(state.currentPlanPath, expectedPath);
  assert.equal(fs.readFileSync(expectedPath, 'utf8'), 'Goal: 保留 UTF-8 中文\nSteps:\n- write plan file\n');
  assert.equal(readCurrentPlanFile(workspaceRoot), 'Goal: 保留 UTF-8 中文\nSteps:\n- write plan file');
  assert.match(formatCurrentPlan(state), /Plan file:/);
  assert.match(formatCurrentPlan(state), /\.0-1-cli[\\/]plans[\\/]current\.md/);

  const restored = createSessionState({ modelId: 'model-a', autoAccept: false });
  loadCurrentPlanFromWorkspace(restored, workspaceRoot);
  assert.equal(restored.currentPlan, 'Goal: 保留 UTF-8 中文\nSteps:\n- write plan file');
  assert.equal(restored.currentPlanPath, expectedPath);
});

test('resolveModeCommand supports slash mode commands', () => {
  const { resolveModeCommand } = require('../dist/chat/modes');

  assert.deepEqual(resolveModeCommand('/chat'), { mode: 'chat' });
  assert.deepEqual(resolveModeCommand('/agent'), { mode: 'agent' });
  assert.deepEqual(resolveModeCommand('/plan'), { mode: 'plan' });
  assert.equal(resolveModeCommand('/model'), null);
});

test('/plan with inline text queues that text as the next user input', () => {
  const { resolveModeCommandAction } = require('../dist/chat/modes');

  assert.deepEqual(resolveModeCommandAction('/plan', '  先梳理风险，再列执行步骤  '), {
    mode: 'plan',
    nextInput: '先梳理风险，再列执行步骤',
  });
  assert.deepEqual(resolveModeCommandAction('/plan', ''), { mode: 'plan' });
  assert.deepEqual(resolveModeCommandAction('/chat', '只切模式，不提交'), { mode: 'chat' });
  assert.equal(resolveModeCommandAction('/model', 'info'), null);
});

test('chat loop consumes queued slash-command input before prompting again', () => {
  const source = readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /let\s+queuedInput:\s*string\s*\|\s*null\s*=\s*null/);
  assert.match(source, /queuedInput\s+\?\?\s+await ask\(\)/);
  assert.match(source, /'nextInput'\s+in\s+handled/);
});

test('plan-aware loop records plan replies and lets /plan show the current plan', () => {
  const source = readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /handlePlanApprovalResult/);
  assert.match(source, /preparePlanModeSession\(session,\s*process\.cwd\(\)\)/);
  assert.match(source, /resolvePlanApprovalOutcome/);
  assert.match(source, /recordCurrentPlan\(session,\s*plan,\s*\{\s*workspaceRoot:\s*process\.cwd\(\)\s*\}\)/);
  assert.match(source, /session\.mode === 'plan' && result\.finalMessage\.content/);
  assert.match(source, /recordCurrentPlan\(session,\s*result\.finalMessage\.content,\s*\{\s*workspaceRoot:\s*process\.cwd\(\)\s*\}\)/);
  assert.match(source, /formatCurrentPlan\(session\)/);
  assert.match(source, /cmd === '\/plan' && !args\.trim\(\) && session\.mode === 'plan'/);
  assert.match(source, /args\.trim\(\)\.toLowerCase\(\) === 'open'/);
  assert.match(source, /currentPlanPath:\s*session\.currentPlanPath/);
  assert.match(source, /loadCurrentPlanFromWorkspace\(session,\s*process\.cwd\(\)\)/);
});

test('plan mode uses the tool-aware agent loop for exit plan approval', () => {
  const source = readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /session\.mode === 'agent' \|\| session\.mode === 'plan'/);
  assert.match(source, /result\.status === 'plan_approval_required'/);
  assert.match(source, /setMode\(session,\s*'agent'\)/);
});

test('preparePlanModeSession stores plan draft path when entering plan mode', () => {
  const { createSessionState } = require('../dist/chat/session');
  const { preparePlanModeSession } = require('../dist/chat/modes');
  const { getCurrentPlanPath } = require('../dist/chat/plan-store');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-plan-mode-entry-'));
  const state = createSessionState({ modelId: 'model-a', autoAccept: false });

  preparePlanModeSession(state, workspaceRoot);

  const expectedPath = getCurrentPlanPath(workspaceRoot);
  assert.equal(state.currentPlanPath, expectedPath);
  assert.ok(fs.existsSync(expectedPath));
});

test('resolvePlanApprovalOutcome switches to agent on approval and stays in plan on rejection', () => {
  const { resolvePlanApprovalOutcome } = require('../dist/chat/modes');

  assert.deepEqual(resolvePlanApprovalOutcome(true, { autoAccept: false }), {
    mode: 'agent',
    permissionMode: 'ask',
  });
  assert.deepEqual(resolvePlanApprovalOutcome(true, { autoAccept: true }), {
    mode: 'agent',
    permissionMode: 'bypass',
  });
  assert.deepEqual(resolvePlanApprovalOutcome(false, { autoAccept: false }), {
    mode: 'plan',
    permissionMode: 'plan',
  });
});

test('mode metadata and cycle mirror Claude-style footer modes', () => {
  const { getModeConfig, getNextMode } = require('../dist/chat/modes');
  const { createSessionState } = require('../dist/chat/session');
  const normal = createSessionState({ modelId: 'model-a', autoAccept: false });
  const auto = createSessionState({ modelId: 'model-a', autoAccept: true });

  assert.deepEqual(getModeConfig('chat'), {
    title: 'Chat Mode',
    shortTitle: 'Chat',
    symbol: 'C',
    color: 'text',
    hint: 'read-only',
  });
  assert.deepEqual(getModeConfig('agent'), {
    title: 'Agent Mode',
    shortTitle: 'Agent',
    symbol: 'A',
    color: 'permission',
    hint: 'asks before tools',
  });
  assert.deepEqual(getModeConfig('plan'), {
    title: 'Plan Mode',
    shortTitle: 'Plan',
    symbol: 'P',
    color: 'plan',
    hint: 'no edits',
  });

  assert.equal(getNextMode(normal), 'agent');
  normal.mode = 'agent';
  normal.permissionMode = 'ask';
  assert.equal(getNextMode(normal), 'plan');
  normal.mode = 'plan';
  normal.permissionMode = 'plan';
  assert.equal(getNextMode(normal), 'chat');

  assert.equal(getNextMode(auto), 'chat');
  auto.mode = 'chat';
  auto.permissionMode = 'ask';
  assert.equal(getNextMode(auto), 'plan');
  auto.mode = 'plan';
  auto.permissionMode = 'plan';
  assert.equal(getNextMode(auto), 'agent');
});
