const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('agent loop executes tool calls and continues to final assistant message', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'agent saw UTF-8 Chinese 中文', 'utf8');

  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'read note.txt' },
  ];
  const seenMessageCounts = [];
  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    complete: async (nextMessages) => {
      seenMessageCounts.push(nextMessages.length);
      if (seenMessageCounts.length === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'note.txt' }) },
          }],
        };
      }
      assert.equal(nextMessages.at(-1).role, 'tool');
      assert.match(nextMessages.at(-1).content, /agent saw UTF-8 Chinese 中文/);
      return { role: 'assistant', content: 'The file says 中文.' };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.finalMessage.content, 'The file says 中文.');
  assert.equal(result.toolResults.length, 1);
  assert.equal(result.toolResults[0].message.tool_call_id, 'call-1');
  assert.deepEqual(seenMessageCounts, [2, 4]);
  assert.equal(messages.at(-1).content, 'The file says 中文.');
});

test('agent loop stops before executing ask-permission tools', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-ask-'));

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'write a file' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    complete: async () => ({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-write',
        type: 'function',
        function: { name: 'write_file', arguments: JSON.stringify({ path: 'out.txt', content: 'no' }) },
      }],
    }),
  });

  assert.equal(result.status, 'permission_required');
  assert.equal(result.pendingToolCall.id, 'call-write');
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);
});

test('agent loop can delegate Claude-style task tool calls to subagent handler', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-task-'));
  const delegated = [];

  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'split the review' },
  ];
  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    handleAgentTool: async (toolCall) => {
      delegated.push(JSON.parse(toolCall.function.arguments));
      return {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: 'Subagent sub-1 queued: Review renderer',
      };
    },
    complete: async (nextMessages) => {
      if (delegated.length === 0) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-task',
            type: 'function',
            function: {
              name: 'task',
              arguments: JSON.stringify({
                description: 'Review renderer',
                prompt: 'Inspect renderer output.',
                subagent_type: 'general-purpose',
              }),
            },
          }],
        };
      }
      assert.equal(nextMessages.at(-1).role, 'tool');
      assert.match(nextMessages.at(-1).content, /sub-1 queued/);
      return { role: 'assistant', content: 'Delegated renderer review.' };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.finalMessage.content, 'Delegated renderer review.');
  assert.equal(result.toolResults.length, 1);
  assert.deepEqual(delegated[0], {
    description: 'Review renderer',
    prompt: 'Inspect renderer output.',
    subagent_type: 'general-purpose',
  });
});

test('exit_plan_mode reads plan content from workspace file when tool args omit plan', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const { getCurrentPlanPath } = require('../dist/chat/plan-store');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-exit-plan-disk-'));
  const planPath = getCurrentPlanPath(workspaceRoot);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, 'Goal: 从磁盘读取\nSteps:\n- verify lifecycle\n', 'utf8');

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'submit plan' }],
    workspaceRoot,
    mode: 'plan',
    permissionMode: 'plan',
    complete: async () => ({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-exit-plan-disk',
        type: 'function',
        function: {
          name: 'exit_plan_mode',
          arguments: JSON.stringify({
            permissions: [{ action: 'edit files', reason: 'implement plan' }],
          }),
        },
      }],
    }),
  });

  assert.equal(result.status, 'plan_approval_required');
  assert.match(result.plan, /从磁盘读取/);
  assert.deepEqual(result.permissions, [{ action: 'edit files', reason: 'implement plan' }]);
});

test('exit_plan_mode outside plan mode returns a tool error instead of approval request', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-exit-plan-agent-'));
  const messages = [{ role: 'user', content: 'wrong mode' }];

  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    complete: async (nextMessages) => {
      if (nextMessages.some((message) => message.role === 'tool' && /not in plan mode/i.test(message.content))) {
        return { role: 'assistant', content: 'Understood.' };
      }
      return {
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: 'call-exit-plan-agent',
          type: 'function',
          function: {
            name: 'exit_plan_mode',
            arguments: JSON.stringify({ plan: 'Goal: should not approve here' }),
          },
        }],
      };
    },
  });

  assert.equal(result.status, 'completed');
  assert.match(messages.find((message) => message.role === 'tool').content, /not in plan mode/i);
  assert.equal(result.toolResults.length, 1);
  assert.match(result.toolResults[0].message.content, /not in plan mode/i);
});

test('agent loop turns exit_plan_mode into a plan approval request', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-exit-plan-'));
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'draft plan' },
  ];

  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'plan',
    permissionMode: 'plan',
    complete: async () => ({
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call-exit-plan',
        type: 'function',
        function: {
          name: 'exit_plan_mode',
          arguments: JSON.stringify({
            plan: 'Goal: 保留 UTF-8 中文\nSteps:\n- implement safely',
            permissions: [{ action: 'edit files', reason: 'implement plan' }],
          }),
        },
      }],
    }),
  });

  assert.equal(result.status, 'plan_approval_required');
  assert.equal(result.pendingToolCall.id, 'call-exit-plan');
  assert.match(result.plan, /保留 UTF-8 中文/);
  assert.deepEqual(result.permissions, [{ action: 'edit files', reason: 'implement plan' }]);
  assert.equal(messages.at(-1).tool_calls[0].function.name, 'exit_plan_mode');
});

test('agent loop executes multiple tool calls in order with one result each', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-multi-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'ordered 中文', 'utf8');

  const messages = [{ role: 'user', content: 'inspect workspace' }];
  const result = await runAgentTurn({
    messages,
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    complete: async (nextMessages) => {
      const toolMessages = nextMessages.filter((message) => message.role === 'tool');
      if (toolMessages.length === 0) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [
            toolCall('call-1', 'read_file', { path: 'note.txt' }),
            toolCall('call-2', 'list_files', { path: '.' }),
          ],
        };
      }

      assert.deepEqual(toolMessages.map((message) => message.tool_call_id), ['call-1', 'call-2']);
      assert.match(toolMessages[0].content, /ordered 中文/);
      assert.match(toolMessages[1].content, /note\.txt/);
      return { role: 'assistant', content: 'Both tools completed in order.' };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.toolResults.length, 2);
  assert.deepEqual(result.toolResults.map((entry) => entry.toolCall.id), ['call-1', 'call-2']);
  assert.equal(result.finalMessage.content, 'Both tools completed in order.');
});

test('agent loop emits structured turn, tool, and completion events', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-events-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'event stream 中文', 'utf8');
  const events = [];

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'read note.txt' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    onEvent: (event) => events.push(event),
    complete: async (nextMessages) => {
      if (!nextMessages.some((message) => message.role === 'tool')) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [toolCall('call-events', 'read_file', { path: 'note.txt' })],
        };
      }
      return { role: 'assistant', content: 'Read complete.' };
    },
  });

  assert.equal(result.status, 'completed');
  assert.deepEqual(events.map((event) => event.type), [
    'turn_start',
    'assistant_message',
    'tool_start',
    'tool_result',
    'turn_start',
    'assistant_message',
    'turn_complete',
  ]);
  assert.deepEqual(events.find((event) => event.type === 'tool_start'), {
    type: 'tool_start',
    round: 1,
    toolCallId: 'call-events',
    toolName: 'read_file',
  });
  assert.equal(events.find((event) => event.type === 'tool_result').permissionDecision, 'allow');
  assert.equal(events.at(-1).status, 'completed');
  assert.equal(events.at(-1).toolResultCount, 1);
});

test('agent loop emits permission events before returning for approval', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-permission-events-'));
  const events = [];

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'write a file' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'ask',
    onEvent: (event) => events.push(event),
    complete: async () => ({
      role: 'assistant',
      content: '',
      tool_calls: [toolCall('call-permission-events', 'write_file', { path: 'out.txt', content: 'blocked' })],
    }),
  });

  assert.equal(result.status, 'permission_required');
  assert.deepEqual(events.map((event) => event.type), [
    'turn_start',
    'assistant_message',
    'tool_start',
    'permission_required',
  ]);
  assert.equal(events.at(-1).toolName, 'write_file');
  assert.equal(events.at(-1).toolCallId, 'call-permission-events');
});

test('agent loop stops after max tool rounds with a clear assistant message', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-max-rounds-'));
  let rounds = 0;

  const result = await runAgentTurn({
    messages: [{ role: 'user', content: 'keep calling tools' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    maxToolRounds: 2,
    complete: async () => {
      rounds += 1;
      return {
        role: 'assistant',
        content: '',
        tool_calls: [toolCall(`call-${rounds}`, 'list_files', { path: '.' })],
      };
    },
  });

  assert.equal(result.status, 'completed');
  assert.equal(rounds, 2);
  assert.match(result.finalMessage.content, /Stopped after 2 tool rounds/i);
  assert.equal(result.toolResults.length, 2);
});

test('agent loop stops between tool rounds when abort signal is triggered', async () => {
  const { runAgentTurn } = require('../dist/chat/agent/loop');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-loop-abort-'));
  const abort = new AbortController();
  let rounds = 0;

  const resultPromise = runAgentTurn({
    messages: [{ role: 'user', content: 'keep going' }],
    workspaceRoot,
    mode: 'agent',
    permissionMode: 'bypass',
    abortSignal: abort.signal,
    complete: async () => {
      rounds += 1;
      if (rounds === 1) abort.abort();
      return {
        role: 'assistant',
        content: '',
        tool_calls: [toolCall('call-abort', 'list_files', { path: '.' })],
      };
    },
  });

  await assert.rejects(resultPromise, (error) => error.name === 'AbortError');
  assert.equal(rounds, 1);
});

function toolCall(id, name, args) {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}
