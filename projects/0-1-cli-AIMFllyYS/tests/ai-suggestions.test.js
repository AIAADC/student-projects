const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('SuggestionItem type exposes id, displayText, description, source, and optional metadata', () => {
  const { createCommandSuggestion, createSkillSuggestion, createModelSuggestion, createAgentSuggestion } = require('../dist/chat/suggestions');

  const cmd = createCommandSuggestion({ id: 'plan', command: '/plan', description: 'Plan work' });
  assert.equal(cmd.id, 'cmd:plan');
  assert.equal(cmd.displayText, '/plan');
  assert.equal(cmd.description, 'Plan work');
  assert.equal(cmd.source, 'command');

  const skill = createSkillSuggestion({ id: 'tdd', name: 'test-driven-development', description: 'TDD skill' });
  assert.equal(skill.id, 'skill:tdd');
  assert.equal(skill.source, 'skill');

  const model = createModelSuggestion('gpt-4o');
  assert.equal(model.id, 'model:gpt-4o');
  assert.equal(model.source, 'model');
  assert.equal(model.displayText, 'gpt-4o');

  const agent = createAgentSuggestion({ id: 'explore', name: 'explore', description: 'Explore codebase' });
  assert.equal(agent.id, 'agent:explore');
  assert.equal(agent.source, 'agent');
});

test('collectUnifiedSuggestions merges multiple sources and caps results', () => {
  const { collectUnifiedSuggestions } = require('../dist/chat/suggestions');

  const commands = [
    { id: 'chat', command: '/chat', description: 'Chat mode' },
    { id: 'agent', command: '/agent', description: 'Agent mode' },
    { id: 'plan', command: '/plan', description: 'Plan mode' },
  ];
  const skills = [
    { id: 'tdd', name: 'test-driven-development', description: 'TDD' },
  ];
  const models = ['gpt-4o', 'claude-sonnet'];
  const agents = [
    { id: 'explore', name: 'explore', description: 'Explore codebase' },
  ];

  const result = collectUnifiedSuggestions({ commands, skills, models, agents, maxResults: 5 });
  assert.ok(result.length <= 5, 'Must respect maxResults cap');
  assert.ok(result.every((item) => item.id && item.displayText && item.source));
});

test('collectUnifiedSuggestions deterministic ordering: commands first, then skills, models, agents', () => {
  const { collectUnifiedSuggestions } = require('../dist/chat/suggestions');

  const commands = [{ id: 'chat', command: '/chat', description: 'Chat' }];
  const skills = [{ id: 'tdd', name: 'tdd', description: 'TDD' }];
  const models = ['gpt-4o'];
  const agents = [{ id: 'explore', name: 'explore', description: 'Explore' }];

  const result = collectUnifiedSuggestions({ commands, skills, models, agents, maxResults: 20 });
  const sources = result.map((item) => item.source);
  const commandIdx = sources.indexOf('command');
  const skillIdx = sources.indexOf('skill');
  const modelIdx = sources.indexOf('model');
  const agentIdx = sources.indexOf('agent');

  assert.ok(commandIdx <= skillIdx, 'Commands before skills');
  assert.ok(skillIdx <= modelIdx, 'Skills before models');
  assert.ok(modelIdx <= agentIdx, 'Models before agents');
});

test('filterUnifiedSuggestions filters by query across all sources', () => {
  const { collectUnifiedSuggestions, filterUnifiedSuggestions } = require('../dist/chat/suggestions');

  const commands = [
    { id: 'chat', command: '/chat', description: 'Chat mode' },
    { id: 'model', command: '/model', description: 'Choose model' },
  ];
  const skills = [{ id: 'tdd', name: 'test-driven', description: 'Test driven' }];
  const models = ['gpt-4o'];
  const agents = [];

  const all = collectUnifiedSuggestions({ commands, skills, models, agents });
  const filtered = filterUnifiedSuggestions(all, 'mod');
  assert.ok(filtered.some((item) => item.displayText === '/model'), 'Should match command by query');

  const noMatch = filterUnifiedSuggestions(all, 'zzzznothing');
  assert.equal(noMatch.length, 0, 'Non-matching query returns empty');
});

test('Chinese text in suggestion items survives round-trip', () => {
  const { createSkillSuggestion } = require('../dist/chat/suggestions');

  const skill = createSkillSuggestion({ id: 'cn', name: '中文技能', description: '测试中文描述' });
  assert.equal(skill.displayText, '中文技能');
  assert.equal(skill.description, '测试中文描述');
  assert.ok(!skill.displayText.includes('\uFFFD'), 'No replacement characters in Chinese text');
});

test('unified suggestion items have no account/telemetry/login fields', () => {
  const { collectUnifiedSuggestions } = require('../dist/chat/suggestions');

  const commands = [
    { id: 'chat', command: '/chat', description: 'Chat mode' },
    { id: 'agent', command: '/agent', description: 'Agent mode' },
  ];

  const result = collectUnifiedSuggestions({ commands, skills: [], models: [], agents: [] });
  const json = JSON.stringify(result).toLowerCase();
  assert.doesNotMatch(json, /login|logout|oauth|telemetry|analytics|subscription|billing|entitlement/);
});

test('path suggestions are included in unified suggestions when workspace root is provided', () => {
  const { collectUnifiedSuggestions } = require('../dist/chat/suggestions');

  const result = collectUnifiedSuggestions({
    commands: [],
    skills: [],
    models: [],
    agents: [],
    pathItems: [
      { id: 'path:src/', displayText: 'src/', description: 'directory', source: 'path' },
    ],
  });
  assert.ok(result.some((item) => item.source === 'path'));
});
