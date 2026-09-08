const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function writeCall(id = 'call-write') {
  return {
    id,
    type: 'function',
    function: {
      name: 'write_file',
      arguments: JSON.stringify({ path: 'out.txt', content: 'created 中文' }),
    },
  };
}

test('permission prompt choice parser supports allow once deny and session allow', () => {
  const { formatPermissionPromptOptions, parsePermissionPromptChoice } = require('../dist/chat/permissions/prompts');

  assert.deepEqual(parsePermissionPromptChoice('1'), { kind: 'allow_once' });
  assert.deepEqual(parsePermissionPromptChoice('allow'), { kind: 'allow_once' });
  assert.deepEqual(parsePermissionPromptChoice('2'), { kind: 'allow_session' });
  assert.deepEqual(parsePermissionPromptChoice('3'), { kind: 'deny' });
  assert.deepEqual(parsePermissionPromptChoice('4'), { kind: 'deny_feedback' });
  assert.deepEqual(parsePermissionPromptChoice('feedback'), { kind: 'deny_feedback' });
  assert.deepEqual(parsePermissionPromptChoice('5'), { kind: 'cancel' });
  assert.deepEqual(parsePermissionPromptChoice('cancel'), { kind: 'cancel' });
  assert.deepEqual(parsePermissionPromptChoice('session'), { kind: 'allow_session' });
  assert.deepEqual(parsePermissionPromptChoice('no'), { kind: 'deny' });
  assert.deepEqual(parsePermissionPromptChoice('wat'), { kind: 'invalid' });
  assert.match(formatPermissionPromptOptions(), /4\) Deny with feedback/);
  assert.match(formatPermissionPromptOptions(), /5\) Cancel/);
});

test('allow once executes pending tool then resumes the agent turn', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const { applyPermissionPromptChoice } = require('../dist/chat/permissions/prompts');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-dialog-'));
  const messages = [{ role: 'user', content: 'write out.txt' }];
  let completionCount = 0;
  const complete = async () => {
    completionCount += 1;
    if (completionCount === 1) {
      return { role: 'assistant', content: '', tool_calls: [writeCall()] };
    }
    return { role: 'assistant', content: 'Wrote the file.' };
  };

  const pending = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    complete,
  });
  assert.equal(pending.status, 'permission_required');

  const session = {};
  const resumed = await applyPermissionPromptChoice({
    choice: { kind: 'allow_once' },
    pending,
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete,
  });

  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.finalMessage.content, 'Wrote the file.');
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'out.txt'), 'utf8'), 'created 中文');
  assert.equal(messages.at(-2).role, 'tool');
  assert.equal(messages.at(-1).content, 'Wrote the file.');
  assert.equal(session.allowedTools, undefined);
  assert.equal(session.allowedRules, undefined);
});

test('allow session remembers the tool while deny never executes it', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const { applyPermissionPromptChoice } = require('../dist/chat/permissions/prompts');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-session-'));
  const session = {};

  const denied = await applyPermissionPromptChoice({
    choice: { kind: 'deny' },
    pending: {
      status: 'permission_required',
      pendingToolCall: writeCall('deny-call'),
      permission: { decision: 'ask', reason: 'agent mode requires confirmation' },
      assistantMessage: { role: 'assistant', content: '', tool_calls: [writeCall('deny-call')] },
      toolMessage: { role: 'tool', tool_call_id: 'deny-call', content: 'Permission required' },
      toolResults: [],
    },
    messages: [{ role: 'assistant', content: '', tool_calls: [writeCall('deny-call')] }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete: async () => ({ role: 'assistant', content: 'Denied.' }),
  });
  assert.equal(denied.status, 'denied');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);

  const pending = await runAgentTurn({
    messages: [{ role: 'user', content: 'write again' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete: async () => ({ role: 'assistant', content: '', tool_calls: [writeCall('session-call')] }),
  });
  assert.equal(pending.status, 'permission_required');

  await applyPermissionPromptChoice({
    choice: { kind: 'allow_session' },
    pending,
    messages: [{ role: 'assistant', content: '', tool_calls: [writeCall('session-call')] }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete: async () => ({ role: 'assistant', content: 'Session allowed.' }),
  });

  assert.equal(session.allowedTools, undefined);
  assert.equal(session.allowedRules[0].toolName, 'write_file');
  assert.ok(session.allowedRules[0].pathPrefix.endsWith('out.txt'));
});

test('deny with feedback sends tool feedback to the agent and resumes', async () => {
  const { applyPermissionPromptChoice } = require('../dist/chat/permissions/prompts');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-feedback-'));
  const messages = [{ role: 'assistant', content: '', tool_calls: [writeCall('feedback-call')] }];
  let completionCount = 0;

  const resumed = await applyPermissionPromptChoice({
    choice: { kind: 'deny_feedback', feedback: 'Use a dry-run summary instead.' },
    pending: {
      status: 'permission_required',
      pendingToolCall: writeCall('feedback-call'),
      permission: { decision: 'ask', reason: 'agent mode requires confirmation' },
      assistantMessage: messages[0],
      toolMessage: { role: 'tool', tool_call_id: 'feedback-call', content: 'Permission required' },
      toolResults: [],
    },
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session: {},
    complete: async (nextMessages) => {
      completionCount += 1;
      assert.match(nextMessages.at(-1).content, /Use a dry-run summary instead/);
      return { role: 'assistant', content: 'I will summarize without writing.' };
    },
  });

  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.finalMessage.content, 'I will summarize without writing.');
  assert.equal(completionCount, 1);
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);
});

test('cancel stops the permission request without executing or resuming', async () => {
  const { applyPermissionPromptChoice } = require('../dist/chat/permissions/prompts');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-cancel-'));
  let completionCount = 0;

  const cancelled = await applyPermissionPromptChoice({
    choice: { kind: 'cancel' },
    pending: {
      status: 'permission_required',
      pendingToolCall: writeCall('cancel-call'),
      permission: { decision: 'ask', reason: 'agent mode requires confirmation' },
      assistantMessage: { role: 'assistant', content: '', tool_calls: [writeCall('cancel-call')] },
      toolMessage: { role: 'tool', tool_call_id: 'cancel-call', content: 'Permission required' },
      toolResults: [],
    },
    messages: [{ role: 'assistant', content: '', tool_calls: [writeCall('cancel-call')] }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session: {},
    complete: async () => {
      completionCount += 1;
      return { role: 'assistant', content: 'Should not run.' };
    },
  });

  assert.equal(cancelled.status, 'cancelled');
  assert.equal(completionCount, 0);
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);
});

test('deny records a recent denial and formatRecentDenials renders it', async () => {
  const { applyPermissionPromptChoice, formatRecentDenials } = require('../dist/chat/permissions/prompts');
  const { getRecentDenials } = require('../dist/chat/permissions/engine');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-recent-'));
  const session = {};

  await applyPermissionPromptChoice({
    choice: { kind: 'deny' },
    pending: {
      status: 'permission_required',
      pendingToolCall: writeCall('recent-deny-call'),
      permission: { decision: 'ask', reason: 'agent mode requires confirmation' },
      assistantMessage: { role: 'assistant', content: '', tool_calls: [writeCall('recent-deny-call')] },
      toolMessage: { role: 'tool', tool_call_id: 'recent-deny-call', content: 'Permission required' },
      toolResults: [],
    },
    messages: [{ role: 'assistant', content: '', tool_calls: [writeCall('recent-deny-call')] }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete: async () => ({ role: 'assistant', content: 'Denied.' }),
  });

  const denials = getRecentDenials(session);
  assert.equal(denials.length, 1);
  assert.equal(denials[0].toolName, 'write_file');
  assert.match(denials[0].reason, /denied by user/);
  assert.ok(denials[0].timestamp > 0);

  const rendered = formatRecentDenials(session);
  assert.match(rendered, /Recent Denials/);
  assert.match(rendered, /write_file/);
});

test('deny_feedback records a recent denial with feedback text', async () => {
  const { applyPermissionPromptChoice } = require('../dist/chat/permissions/prompts');
  const { getRecentDenials } = require('../dist/chat/permissions/engine');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-permission-recent-fb-'));
  const session = {};

  await applyPermissionPromptChoice({
    choice: { kind: 'deny_feedback', feedback: 'Not safe to proceed.' },
    pending: {
      status: 'permission_required',
      pendingToolCall: writeCall('recent-fb-call'),
      permission: { decision: 'ask', reason: 'agent mode requires confirmation' },
      assistantMessage: { role: 'assistant', content: '', tool_calls: [writeCall('recent-fb-call')] },
      toolMessage: { role: 'tool', tool_call_id: 'recent-fb-call', content: 'Permission required' },
      toolResults: [],
    },
    messages: [{ role: 'assistant', content: '', tool_calls: [writeCall('recent-fb-call')] }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    session,
    complete: async () => ({ role: 'assistant', content: 'Acknowledged.' }),
  });

  const denials = getRecentDenials(session);
  assert.equal(denials.length, 1);
  assert.match(denials[0].reason, /Not safe to proceed/);
});

test('formatRecentDenials returns empty string when no denials exist', () => {
  const { formatRecentDenials } = require('../dist/chat/permissions/prompts');
  assert.equal(formatRecentDenials({}), '');
  assert.equal(formatRecentDenials(undefined), '');
});

test('formatPermissionBox shows file change preview with operation label', () => {
  const { formatFilePermissionBox } = require('../dist/chat/permissions/prompts');

  const createResult = formatFilePermissionBox({
    tool: 'write_file',
    filePath: 'src/new.ts',
    operation: 'create',
    added: 5,
    removed: 0,
    changed: 0,
  });
  assert.match(createResult, /Create/i);
  assert.match(createResult, /\+5/);
  assert.match(createResult, /new\.ts/);

  const overwriteResult = formatFilePermissionBox({
    tool: 'write_file',
    filePath: 'src/existing.ts',
    operation: 'overwrite',
    added: 3,
    removed: 2,
    changed: 1,
  });
  assert.match(overwriteResult, /Overwrite/i);
  assert.match(overwriteResult, /\+3/);
  assert.match(overwriteResult, /\-2/);

  const editResult = formatFilePermissionBox({
    tool: 'write_file',
    filePath: 'src/edit.ts',
    operation: 'edit',
    added: 1,
    removed: 1,
    changed: 2,
  });
  assert.match(editResult, /Edit/i);
});

test('formatFilePermissionBox preserves UTF-8 file paths', () => {
  const { formatFilePermissionBox } = require('../dist/chat/permissions/prompts');

  const result = formatFilePermissionBox({
    tool: 'write_file',
    filePath: 'docs/中文文档.md',
    operation: 'create',
    added: 10,
    removed: 0,
    changed: 0,
  });
  assert.match(result, /中文文档\.md/);
  assert.doesNotMatch(result, /\ufffd/);
});
