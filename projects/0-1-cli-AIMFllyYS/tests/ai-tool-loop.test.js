const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

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

test('tool call runner executes read tools in chat mode', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-read-'));
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'hello UTF-8 中文', 'utf8');

  const result = await executeToolCall({
    toolCall: toolCall('call-read', 'read_file', { path: 'note.txt' }),
    mode: 'chat',
    permissionMode: 'ask',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'allow');
  assert.equal(result.permissionRequired, false);
  assert.equal(result.message.role, 'tool');
  assert.equal(result.message.tool_call_id, 'call-read');
  assert.match(result.message.content, /hello UTF-8 中文/);
});

test('tool call runner denies write tools in chat mode without writing', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-deny-'));
  const target = path.join(workspaceRoot, 'out.txt');

  const result = await executeToolCall({
    toolCall: toolCall('call-write', 'write_file', { path: 'out.txt', content: 'nope' }),
    mode: 'chat',
    permissionMode: 'ask',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'deny');
  assert.equal(result.message.role, 'tool');
  assert.equal(result.message.tool_call_id, 'call-write');
  assert.match(result.message.content, /denied/i);
  assert.equal(fs.existsSync(target), false);
});

test('tool call runner executes workspace writes in agent bypass mode', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-write-'));

  const result = await executeToolCall({
    toolCall: toolCall('call-write', 'write_file', { path: 'nested/out.txt', content: 'created' }),
    mode: 'agent',
    permissionMode: 'bypass',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'allow');
  assert.equal(result.message.content, 'OK');
  assert.equal(fs.readFileSync(path.join(workspaceRoot, 'nested', 'out.txt'), 'utf8'), 'created');
});

test('tool call runner returns permission required in agent ask mode', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-ask-'));

  const result = await executeToolCall({
    toolCall: toolCall('call-write', 'write_file', { path: 'out.txt', content: 'wait' }),
    mode: 'agent',
    permissionMode: 'ask',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'ask');
  assert.equal(result.permissionRequired, true);
  assert.match(result.message.content, /permission required/i);
  assert.equal(fs.existsSync(path.join(workspaceRoot, 'out.txt')), false);
});

test('provider tool schemas are generated from the local tool registry', () => {
  const { buildProviderToolSpecs } = require('../dist/chat/tools/registry');
  const specs = buildProviderToolSpecs();
  const names = specs.map((spec) => spec.function.name);

  assert.ok(names.includes('read_file'));
  assert.ok(names.includes('write_file'));
  assert.ok(names.includes('shell'));
  assert.ok(names.includes('task'));
  assert.ok(!names.some((name) => /login|telemetry|anthropic/i.test(name)));

  const readFile = specs.find((spec) => spec.function.name === 'read_file');
  assert.deepEqual(readFile.function.parameters.required, ['path']);
  assert.equal(readFile.function.parameters.properties.path.type, 'string');

  const task = specs.find((spec) => spec.function.name === 'task');
  assert.deepEqual(task.function.parameters.required, ['description', 'prompt']);
  assert.equal(task.function.parameters.properties.subagent_type.type, 'string');
});

test('provider tool schemas are filtered by active mode before the model sees them', () => {
  const { buildProviderToolSpecs } = require('../dist/chat/tools/registry');
  const namesFor = (mode) => buildProviderToolSpecs(mode).map((spec) => spec.function.name);

  assert.deepEqual(namesFor('chat').sort(), ['list_files', 'read_file', 'search_files']);
  assert.deepEqual(namesFor('plan').sort(), ['exit_plan_mode', 'list_files', 'read_file', 'search_files']);
  assert.ok(namesFor('agent').includes('write_file'));
  assert.ok(namesFor('agent').includes('shell'));
  assert.ok(namesFor('agent').includes('task'));
  assert.ok(!namesFor('agent').includes('exit_plan_mode'));
});

test('exit plan mode schema carries plan and permission categories', () => {
  const { buildProviderToolSpecs } = require('../dist/chat/tools/registry');
  const exitPlan = buildProviderToolSpecs('plan').find((spec) => spec.function.name === 'exit_plan_mode');

  assert.ok(exitPlan);
  assert.deepEqual(exitPlan.function.parameters.required, ['plan']);
  assert.equal(exitPlan.function.parameters.properties.plan.type, 'string');
  assert.equal(exitPlan.function.parameters.properties.permissions.type, 'array');
});

test('tool call runner returns structured error for malformed JSON arguments', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-malformed-'));

  const result = await executeToolCall({
    toolCall: {
      id: 'call-bad-json',
      type: 'function',
      function: { name: 'read_file', arguments: '{not json' },
    },
    mode: 'chat',
    permissionMode: 'ask',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'deny');
  assert.equal(result.permissionRequired, false);
  assert.equal(result.message.role, 'tool');
  assert.equal(result.message.tool_call_id, 'call-bad-json');
  assert.match(result.message.content, /Tool error \(read_file\).*malformed JSON/i);
});

test('tool call runner denies unknown tools with structured error', async () => {
  const { executeToolCall } = require('../dist/chat/tools/runner');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-tool-runner-unknown-'));

  const result = await executeToolCall({
    toolCall: toolCall('call-unknown', 'telemetry_upload', {}),
    mode: 'agent',
    permissionMode: 'bypass',
    workspaceRoot,
  });

  assert.equal(result.permission.decision, 'deny');
  assert.equal(result.permissionRequired, false);
  assert.equal(result.message.tool_call_id, 'call-unknown');
  assert.match(result.message.content, /Tool denied: unknown tool telemetry_upload/i);
});

test('provider attaches tools for custom OpenAI-compatible providers', () => {
  const { shouldAttachProviderTools } = require('../dist/chat/provider');
  const tools = [{ type: 'function', function: { name: 'read_file' } }];
  const customProvider = {
    name: 'custom',
    protocol: 'https:',
    hostname: 'example.com',
    path: '/v1/chat/completions',
    key: 'key',
    modelId: 'local-model',
  };

  assert.equal(shouldAttachProviderTools({ id: 'local-model', provider: 'custom' }, customProvider, tools), true);
  assert.equal(shouldAttachProviderTools({ id: 'glm-4', provider: 'zhipu' }, { ...customProvider, name: 'zhipu' }, tools), true);
  assert.equal(shouldAttachProviderTools({ id: 'deepseek-chat', provider: 'deepseek' }, { ...customProvider, name: 'deepseek' }, tools), false);
  assert.equal(shouldAttachProviderTools({ id: 'local-model', provider: 'custom' }, customProvider, []), false);
});
