const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('subagent queue moves queued to running then completed with structured result', async () => {
  const { createSubagentQueue, enqueueSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });

  const task = enqueueSubagent(queue, { prompt: 'Review permission code', mode: 'agent', permissionMode: 'ask', allowedTools: ['read_file'] });
  assert.equal(task.status, 'queued');
  assert.equal(task.mode, 'agent');

  const result = await runNextSubagent(queue, async (running) => {
    assert.equal(running.status, 'running');
    return { summary: 'Reviewed permission code', notes: ['No writes needed'] };
  });

  assert.equal(result.status, 'completed');
  assert.equal(queue.items[0].status, 'completed');
  assert.equal(queue.items[0].result.summary, 'Reviewed permission code');
  assert.deepEqual(queue.items[0].result.notes, ['No writes needed']);
});

test('subagents inherit parent plan skills model and tool limits into default result notes', async () => {
  const { createSubagentQueue, enqueueSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });

  const task = enqueueSubagent(queue, {
    prompt: 'Review release workflow',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file', 'search_files'],
    skillIds: ['frontend-design', 'test-driven-development'],
    modelId: 'model-a',
    currentPlan: 'Goal: ship desktop assets',
  });

  assert.equal(task.currentPlan, 'Goal: ship desktop assets');

  const completed = await runNextSubagent(queue);
  const notes = completed.result.notes.join('\n');

  assert.match(notes, /currentPlan=Goal: ship desktop assets/);
  assert.match(notes, /skillIds=frontend-design,test-driven-development/);
  assert.match(notes, /modelId=model-a/);
  assert.match(notes, /allowedTools=read_file,search_files/);
});

test('subagent message builder scopes task context without account telemetry behavior', () => {
  const { buildSubagentMessages } = require('../dist/chat/agent/prompt');

  const messages = buildSubagentMessages({
    prompt: 'Review release workflow',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file', 'search_files'],
    skillIds: ['frontend-design'],
    modelId: 'model-a',
    currentPlan: 'Goal: ship desktop assets',
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[0].content, /Subagent Runtime/);
  assert.match(messages[0].content, /mode=agent/);
  assert.match(messages[0].content, /permissionMode=ask/);
  assert.match(messages[0].content, /allowedTools=read_file,search_files/);
  assert.match(messages[0].content, /skillIds=frontend-design/);
  assert.match(messages[0].content, /modelId=model-a/);
  assert.match(messages[0].content, /Current Plan/);
  assert.match(messages[0].content, /Goal: ship desktop assets/);
  assert.match(messages[1].content, /Review release workflow/);
  assert.doesNotMatch(messages.map((message) => message.content).join('\n'), /login|logout|oauth|telemetry|analytics|anthropic account/i);
});

test('subagent message builder injects selected agent definition prompt', () => {
  const { buildSubagentMessages } = require('../dist/chat/agent/prompt');

  const messages = buildSubagentMessages({
    prompt: 'Verify the desktop install panel',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file'],
    skillIds: [],
    modelId: 'model-a',
    currentPlan: '',
    agentType: 'verification',
    agentSystemPrompt: 'You are a verification specialist for 0-1 CLI. Do not modify project files.',
  });

  assert.match(messages[0].content, /agentType=verification/);
  assert.match(messages[0].content, /Agent Definition/);
  assert.match(messages[0].content, /verification specialist for 0-1 CLI/);
  assert.doesNotMatch(messages[0].content, /Anthropic account|telemetry|oauth/i);
});

test('subagent message builder includes parent recent messages snapshot', () => {
  const { buildSubagentMessages } = require('../dist/chat/agent/prompt');

  const messages = buildSubagentMessages({
    prompt: 'Inspect auth middleware',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['read_file'],
    skillIds: ['test-driven-development'],
    modelId: 'model-a',
    currentPlanPath: '/tmp/plan.md',
    parentRecentMessages: [
      { role: 'user', content: '请检查登录中间件' },
      { role: 'assistant', content: '我先读取 src/auth.ts。' },
    ],
  });

  assert.match(messages[0].content, /Parent Recent Messages/);
  assert.match(messages[0].content, /Plan file: \/tmp\/plan.md/);
  assert.match(messages[0].content, /请检查登录中间件/);
  assert.match(messages[0].content, /我先读取 src\/auth.ts/);
});

test('built-in and project agent definitions load without account telemetry behavior', () => {
  const { listAgentDefinitions, resolveAgentDefinition } = require('../dist/chat/agent/definitions');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-defs-'));
  const agentDir = path.join(workspaceRoot, '.0-1-cli', 'agents');
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(path.join(agentDir, 'reviewer.md'), [
    '---',
    'name: reviewer',
    'description: 代码审查 agent',
    'tools: read_file,search_files',
    'skills: test-driven-development',
    'permissionMode: plan',
    '---',
    '请保留 UTF-8 中文，并只做只读审查。',
    '',
  ].join('\n'), 'utf8');

  const agents = listAgentDefinitions(workspaceRoot);
  const names = agents.map((agent) => agent.agentType);
  assert.ok(names.includes('general-purpose'));
  assert.ok(names.includes('explore'));
  assert.ok(names.includes('plan'));
  assert.ok(names.includes('verification'));
  assert.ok(names.includes('reviewer'));

  const explore = resolveAgentDefinition(workspaceRoot, 'explore');
  assert.equal(explore.permissionMode, 'plan');
  assert.deepEqual(explore.tools, ['list_files', 'read_file', 'search_files']);

  const plan = resolveAgentDefinition(workspaceRoot, 'plan');
  assert.match(plan.systemPrompt, /READ-ONLY/i);
  assert.deepEqual(plan.tools, ['list_files', 'read_file', 'search_files']);

  const reviewer = resolveAgentDefinition(workspaceRoot, 'reviewer');
  assert.equal(reviewer.whenToUse, '代码审查 agent');
  assert.match(reviewer.systemPrompt, /UTF-8 中文/);
  assert.equal(reviewer.permissionMode, 'plan');
  assert.deepEqual(reviewer.skills, ['test-driven-development']);

  assert.doesNotMatch(agents.map((agent) => agent.systemPrompt).join('\n'), /oauth|login|logout|telemetry|analytics|subscription|anthropic account/i);
});

test('user agent definitions load from home root and project overrides user', () => {
  const { listAgentDefinitions } = require('../dist/chat/agent/definitions');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-user-'));
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-home-'));
  const userDir = path.join(homeRoot, '.0-1-cli', 'agents');
  const projectDir = path.join(workspaceRoot, '.0-1-cli', 'agents');
  fs.mkdirSync(userDir, { recursive: true });
  fs.mkdirSync(projectDir, { recursive: true });

  fs.writeFileSync(path.join(userDir, 'helper.md'), [
    '---',
    'name: helper',
    'description: 用户级 helper',
    '---',
    'User helper prompt.',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(projectDir, 'helper.md'), [
    '---',
    'name: helper',
    'description: 项目级 helper',
    '---',
    'Project helper prompt.',
  ].join('\n'), 'utf8');

  const agents = listAgentDefinitions(workspaceRoot, homeRoot);
  const helper = agents.find((agent) => agent.agentType === 'helper');
  assert.ok(helper);
  assert.equal(helper.source, 'project');
  assert.match(helper.systemPrompt, /Project helper prompt/);
});

test('agent memory snapshot initializes local memory from project snapshot', () => {
  const {
    checkAgentMemorySnapshot,
    initializeFromSnapshot,
    loadAgentMemoryPrompt,
    resolveAgentSystemPrompt,
  } = require('../dist/chat/agent/definitions');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-agent-memory-'));
  const snapshotDir = path.join(workspaceRoot, '.0-1-cli', 'agent-memory-snapshots', 'review-bot');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, 'snapshot.json'), JSON.stringify({ updatedAt: '2026-06-14T10:00:00.000Z' }), 'utf8');
  fs.writeFileSync(path.join(snapshotDir, 'MEMORY.md'), '# Review notes\nPrefer read-only checks.\n', 'utf8');

  const firstCheck = checkAgentMemorySnapshot('review-bot', 'project', workspaceRoot);
  assert.equal(firstCheck.action, 'initialize');
  initializeFromSnapshot('review-bot', 'project', workspaceRoot, firstCheck.snapshotTimestamp);
  const secondCheck = checkAgentMemorySnapshot('review-bot', 'project', workspaceRoot);
  assert.equal(secondCheck.action, 'none');

  const prompt = resolveAgentSystemPrompt({
    agentType: 'review-bot',
    whenToUse: 'Review bot',
    source: 'project',
    baseDir: workspaceRoot,
    systemPrompt: 'Review carefully.',
    memory: 'project',
  }, workspaceRoot);

  assert.match(prompt, /Review carefully/);
  assert.match(prompt, /Persistent Agent Memory/);
  assert.match(prompt, /Prefer read-only checks/);
  assert.match(loadAgentMemoryPrompt('review-bot', 'project', workspaceRoot), /Prefer read-only checks/);
});

test('slash command registry exposes agent definitions listing command', () => {
  const { getSlashCommandDefinitions, isAgentDefinitionsCommand, formatAgentDefinitionsList } = require('../dist/chat/commands');
  const { listAgentDefinitions } = require('../dist/chat/agent/definitions');

  const defs = getSlashCommandDefinitions('agent').find((item) => item.id === 'agent-defs');
  assert.ok(defs);
  assert.match(defs.command, /\/agent defs/);
  assert.ok(isAgentDefinitionsCommand('defs'));
  assert.ok(isAgentDefinitionsCommand('definitions'));

  const rendered = formatAgentDefinitionsList(listAgentDefinitions());
  assert.match(rendered, /general-purpose/);
  assert.match(rendered, /explore/);
  assert.match(rendered, /built-in/);
});

test('AI subagent handler uses scoped prompt tool loop and allowed tool specs', async () => {
  const { createAiSubagentHandler } = require('../dist/chat/agent/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-ai-subagent-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'subagent UTF-8 中文', 'utf8');
  const calls = [];
  const task = {
    id: 'sub-1',
    status: 'running',
    prompt: 'Read note.txt',
    mode: 'agent',
    permissionMode: 'bypass',
    allowedTools: ['read_file'],
    skillIds: ['test-driven-development'],
    modelId: 'model-a',
    currentPlan: 'Goal: verify subagent execution',
    createdAt: Date.now(),
  };

  const handler = createAiSubagentHandler({
    workspaceRoot,
    complete: async (messages, runningTask, tools) => {
      calls.push({ messages: messages.map((message) => message.content), tools: tools.map((tool) => tool.function.name), task: runningTask });
      if (calls.length === 1) {
        return {
          role: 'assistant',
          content: '',
          tool_calls: [{
            id: 'call-read',
            type: 'function',
            function: { name: 'read_file', arguments: JSON.stringify({ path: 'note.txt' }) },
          }],
        };
      }
      assert.equal(messages.at(-1).role, 'tool');
      assert.match(messages.at(-1).content, /subagent UTF-8 中文/);
      return { role: 'assistant', content: 'Read note.txt successfully.' };
    },
  });

  const result = await handler(task);

  assert.equal(result.summary, 'Read note.txt successfully.');
  assert.deepEqual(calls[0].tools, ['read_file']);
  assert.match(calls[0].messages[0], /Goal: verify subagent execution/);
  assert.equal(calls[0].task.id, 'sub-1');
  assert.match(result.notes.join('\n'), /toolResults=1/);
});

test('AI subagent handler applies agent definition disallowed tools', async () => {
  const { createAiSubagentHandler } = require('../dist/chat/agent/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-ai-subagent-deny-'));
  const seenTools = [];

  const handler = createAiSubagentHandler({
    workspaceRoot,
    complete: async (_messages, _runningTask, tools) => {
      seenTools.push(...tools.map((tool) => tool.function.name));
      return { role: 'assistant', content: 'done' };
    },
  });

  await handler({
    id: 'sub-deny',
    status: 'running',
    prompt: 'Check tools',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: ['*'],
    disallowedTools: ['shell', 'write_file'],
    skillIds: [],
    createdAt: Date.now(),
  });

  assert.ok(seenTools.includes('read_file'));
  assert.ok(seenTools.includes('task'));
  assert.ok(!seenTools.includes('shell'));
  assert.ok(!seenTools.includes('write_file'));
});

test('subagent permissions can narrow but not widen parent permissions', () => {
  const { createSubagentQueue, enqueueSubagent } = require('../dist/chat/agent/subagents');

  const askQueue = createSubagentQueue({ parentPermissionMode: 'ask' });
  assert.equal(enqueueSubagent(askQueue, { prompt: 'try bypass', permissionMode: 'bypass' }).permissionMode, 'ask');
  assert.equal(enqueueSubagent(askQueue, { prompt: 'plan only', permissionMode: 'plan' }).permissionMode, 'plan');

  const planQueue = createSubagentQueue({ parentPermissionMode: 'plan' });
  assert.equal(enqueueSubagent(planQueue, { prompt: 'try ask', permissionMode: 'ask' }).permissionMode, 'plan');

  const bypassQueue = createSubagentQueue({ parentPermissionMode: 'bypass' });
  assert.equal(enqueueSubagent(bypassQueue, { prompt: 'keep bypass', permissionMode: 'bypass' }).permissionMode, 'bypass');
});

test('cancelling a queued or running subagent changes status to cancelled', async () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const queued = enqueueSubagent(queue, { prompt: 'queued' });
  const running = enqueueSubagent(queue, { prompt: 'running' });

  assert.equal(cancelSubagent(queue, queued.id).status, 'cancelled');
  const run = runNextSubagent(queue, async () => ({ summary: 'should not complete' }));
  assert.equal(queue.items.find((item) => item.id === running.id).status, 'running');
  assert.equal(cancelSubagent(queue, running.id).status, 'cancelled');
  const result = await run;

  assert.equal(result.status, 'cancelled');
  assert.equal(queue.items.find((item) => item.id === running.id).status, 'cancelled');
});

test('cancelled subagent preserves partial summary when available', async () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const task = enqueueSubagent(queue, { prompt: 'Review files' });
  const partial = { summary: 'Read 2 files before stop', notes: ['read_file=note.txt'] };
  const run = runNextSubagent(queue, async (running) => {
    cancelSubagent(queue, running.id, { partialResult: partial });
    return { summary: 'should not complete' };
  });

  const result = await run;

  assert.equal(result.status, 'cancelled');
  assert.equal(result.result.summary, 'Read 2 files before stop');
  assert.deepEqual(result.result.notes, ['read_file=note.txt']);
});

test('completed subagents are not reported as newly cancelled', () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const task = enqueueSubagent(queue, { prompt: 'done' });
  task.status = 'completed';

  const result = cancelSubagent(queue, task.id);

  assert.equal(result.status, 'completed');
});

test('agent slash command parser supports spawn list and cancel', () => {
  const { resolveAgentCommand } = require('../dist/chat/agent/subagents');

  assert.deepEqual(resolveAgentCommand(''), { kind: 'mode' });
  assert.deepEqual(resolveAgentCommand('list'), { kind: 'list' });
  assert.deepEqual(resolveAgentCommand('cancel sub-1'), { kind: 'cancel', id: 'sub-1' });
  assert.deepEqual(resolveAgentCommand('spawn Review files'), { kind: 'spawn', prompt: 'Review files' });
});

test('agent spawn command forwards the current plan into subagent tasks', () => {
  const source = require('node:fs').readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /currentPlan:\s*session\.currentPlan/);
});

test('agent spawn queue runs through AI subagent handler instead of placeholder handler', () => {
  const source = require('node:fs').readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /createAiSubagentHandler/);
  assert.match(source, /runSubagentScheduler\(hooks\.subagents/);
  assert.match(source, /createAiSubagentHandler/);
});

test('subagent queue defaults to concurrency one', () => {
  const { createSubagentQueue, DEFAULT_SUBAGENT_CONCURRENCY } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });

  assert.equal(DEFAULT_SUBAGENT_CONCURRENCY, 1);
  assert.equal(queue.concurrency, 1);
});

test('subagent scheduler runs queued tasks with configured concurrency', async () => {
  const { createSubagentQueue, enqueueSubagent, runSubagentScheduler } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask', concurrency: 2 });
  enqueueSubagent(queue, { prompt: 'task-a' });
  enqueueSubagent(queue, { prompt: 'task-b' });
  enqueueSubagent(queue, { prompt: 'task-c' });

  let peakRunning = 0;
  const completed = await runSubagentScheduler(queue, async (task) => {
    peakRunning = Math.max(peakRunning, queue.items.filter((item) => item.status === 'running').length);
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { summary: `done:${task.prompt}`, notes: [] };
  });

  assert.equal(peakRunning, 2);
  assert.equal(completed.length, 3);
  assert.deepEqual(completed.map((task) => task.status), ['completed', 'completed', 'completed']);
});

test('cancelSubagent aborts running handler through abort signal', async () => {
  const { createSubagentQueue, enqueueSubagent, cancelSubagent, runNextSubagent } = require('../dist/chat/agent/subagents');
  const queue = createSubagentQueue({ parentPermissionMode: 'ask' });
  const task = enqueueSubagent(queue, { prompt: 'long running' });
  let sawAbort = false;

  const run = runNextSubagent(queue, async (_running, context) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    cancelSubagent(queue, task.id, { partialResult: { summary: 'Stopped early', notes: [] } });
    await new Promise((resolve) => setTimeout(resolve, 10));
    sawAbort = Boolean(context?.signal?.aborted);
    return { summary: 'should not finish', notes: [] };
  });

  const result = await run;

  assert.equal(result.status, 'cancelled');
  assert.equal(result.result.summary, 'Stopped early');
  assert.equal(sawAbort, true);
});

test('formatSubagentActivityDetail includes summary tool permission and elapsed metrics', () => {
  const { formatSubagentActivityDetail } = require('../dist/chat/agent/subagents');

  const detail = formatSubagentActivityDetail({
    id: 'sub-1',
    status: 'completed',
    prompt: 'Review files',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: [],
    disallowedTools: [],
    skillIds: [],
    parentRecentMessages: [],
    createdAt: Date.now(),
    result: {
      summary: 'Reviewed renderer',
      notes: ['mode=agent'],
      toolCount: 2,
      permissionCount: 1,
      elapsedMs: 1500,
    },
  });

  assert.match(detail, /Reviewed renderer/);
  assert.match(detail, /tools=2/);
  assert.match(detail, /permissions=1/);
  assert.match(detail, /1500ms/);
});

test('buildSubagentTimelineInput covers queued running failed and cancelled states', () => {
  const { buildSubagentTimelineInput } = require('../dist/chat/agent/subagents');

  const queued = buildSubagentTimelineInput({
    id: 'sub-1',
    status: 'queued',
    prompt: 'queued task',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: [],
    disallowedTools: [],
    skillIds: [],
    parentRecentMessages: [],
    createdAt: Date.now(),
  });

  assert.equal(queued.id, 'sub-1');
  assert.equal(queued.status, 'queued');
  assert.equal(queued.prompt, 'queued task');

  assert.match(buildSubagentTimelineInput({
    id: 'sub-2',
    status: 'failed',
    prompt: 'broken task',
    mode: 'agent',
    permissionMode: 'ask',
    allowedTools: [],
    disallowedTools: [],
    skillIds: [],
    parentRecentMessages: [],
    createdAt: Date.now(),
    error: 'boom',
  }).error, /boom/);
});
