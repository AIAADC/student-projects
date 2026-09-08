const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('slash typeahead filters commands by query and keeps stable command width', () => {
  const { createSlashTypeaheadState, renderSlashTypeahead } = require('../dist/chat/typeahead');

  const state = createSlashTypeaheadState('/mo', 'agent');
  const output = renderSlashTypeahead(state);

  assert.equal(state.active, true);
  assert.deepEqual(state.suggestions.map((item) => item.command), ['/model', '/model info']);
  assert.ok(state.commandWidth >= '/agent spawn <task>'.length);
  assert.match(output, /\/model/);
  assert.match(output, /Choose a configured model/);
  assert.doesNotMatch(output, /\/chat\s+Switch/);
});

test('slash typeahead renders Claude-style argument hints and source badges', () => {
  const { createSlashTypeaheadState, renderSlashTypeahead } = require('../dist/chat/typeahead');

  const state = createSlashTypeaheadState('/agent s', 'agent');
  const output = renderSlashTypeahead(state).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

  assert.equal(state.active, true);
  assert.equal(state.suggestions[0].command, '/agent spawn');
  assert.equal(state.suggestions[0].argumentHint, '<task>');
  assert.equal(state.suggestions[0].loadedFrom, 'builtin');
  assert.match(output, /\/agent spawn <task>/);
  assert.match(output, /\[builtin\]/);
});

test('slash typeahead can suggest commands through aliases without exposing account commands', () => {
  const { createSlashTypeaheadState } = require('../dist/chat/typeahead');
  const { getSlashCommandDefinitions } = require('../dist/chat/commands');

  const model = createSlashTypeaheadState('/m', 'agent');
  const exit = createSlashTypeaheadState('/q', 'agent');
  const exported = JSON.stringify(getSlashCommandDefinitions('agent')).toLowerCase();

  assert.equal(model.suggestions[0].command, '/model');
  assert.equal(exit.suggestions[0].command, '/exit');
  assert.doesNotMatch(exported, /login|logout|oauth|telemetry|analytics|subscription/);
});

test('slash command definitions have stable IDs distinct from display command', () => {
  const { getSlashCommandDefinitions } = require('../dist/chat/commands');

  const definitions = getSlashCommandDefinitions('agent');
  const ids = definitions.map((item) => item.id);

  assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0));
  assert.ok(ids.includes('chat'));
  assert.ok(ids.includes('agent'));
  assert.ok(ids.includes('agent-spawn'));
  assert.ok(ids.includes('model'));
  assert.ok(ids.includes('model-info'));
  assert.ok(ids.includes('skills'));
  assert.ok(ids.includes('skill'));
  assert.ok(ids.includes('exit'));
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length, 'IDs must be unique');
});

test('slash menu groups commands in order Mode Agent Runtime Skills Help', () => {
  const { formatSlashMenu, getSlashCommandDefinitions } = require('../dist/chat/commands');

  const menu = formatSlashMenu('agent');
  const definitions = getSlashCommandDefinitions('agent');

  const modeIdx = menu.indexOf('Mode');
  const agentIdx = menu.indexOf('Agent');
  const runtimeIdx = menu.indexOf('Runtime');
  const skillsIdx = menu.indexOf('Skills');
  const helpIdx = menu.indexOf('Help');

  assert.ok(modeIdx >= 0, 'Mode category must exist');
  assert.ok(agentIdx > modeIdx, 'Agent must follow Mode');
  assert.ok(runtimeIdx > agentIdx, 'Runtime must follow Agent');
  assert.ok(skillsIdx > runtimeIdx, 'Skills must follow Runtime');
  assert.ok(helpIdx > skillsIdx, 'Help must follow Skills');

  const skillsItems = definitions.filter((item) => item.category === 'Skills');
  assert.ok(skillsItems.some((item) => item.command === '/skills'));
  assert.ok(skillsItems.some((item) => item.command === '/skill <id|name>'));
});

test('slash suggestions expose matched aliases like Claude command suggestions', () => {
  const { createSlashTypeaheadState, renderSlashTypeahead } = require('../dist/chat/typeahead');
  const state = createSlashTypeaheadState('/q', 'agent');
  const output = renderSlashTypeahead(state).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

  assert.equal(state.suggestions[0].command, '/exit');
  assert.equal(state.suggestions[0].matchedAlias, '/q');
  assert.match(output, /\/exit \(\/q\)/);
});

test('slash suggestions match command parts split by Claude separators', () => {
  const { generateSlashSuggestions } = require('../dist/chat/typeahead');
  const items = [
    { command: '/agent-cancel', description: 'Cancel an agent task', loadedFrom: 'builtin' },
    { command: '/agent-create', description: 'Create an agent task', loadedFrom: 'builtin' },
    { command: '/memory:add', description: 'Add memory entry', loadedFrom: 'builtin' },
    { command: '/model', description: 'Choose model', loadedFrom: 'builtin' },
    { command: '/login', description: 'Account command should stay hidden', loadedFrom: 'builtin', isHidden: true },
  ];

  assert.deepEqual(generateSlashSuggestions('/cancel', items).map((item) => item.command), ['/agent-cancel']);
  assert.deepEqual(generateSlashSuggestions('/add', items).map((item) => item.command), ['/memory:add']);
  assert.ok(!generateSlashSuggestions('/login', items).some((item) => item.command === '/login'));
});

test('slash typeahead ranks exact aliases before prefix matches and falls back to descriptions', () => {
  const { createSlashTypeaheadState } = require('../dist/chat/typeahead');

  const alias = createSlashTypeaheadState('/s', 'agent');
  const description = createSlashTypeaheadState('/web', 'agent');

  assert.equal(alias.suggestions[0].command, '/search');
  assert.equal(description.suggestions[0].command, '/search');
});

test('slash suggestion helpers detect mid-input commands and best matches', () => {
  const {
    applyMidInputSlashCompletion,
    findMidInputSlashCommand,
    findSlashCommandPositions,
    getMidInputSlashGhostText,
    getBestSlashCommandMatch,
  } = require('../dist/chat/typeahead');

  assert.deepEqual(findMidInputSlashCommand('please /pla', 11), {
    token: '/pla',
    startPos: 7,
    partialCommand: 'pla',
  });
  assert.equal(findMidInputSlashCommand('/pla', 4), null);
  assert.deepEqual(getBestSlashCommandMatch('pla', 'agent'), {
    suffix: 'n',
    fullCommand: '/plan',
  });
  assert.deepEqual(getMidInputSlashGhostText('please /pla', 11, 'agent'), {
    text: 'n',
    fullCommand: '/plan',
    insertPosition: 11,
  });
  assert.equal(getMidInputSlashGhostText('/pla', 4, 'agent'), null);
  assert.equal(getMidInputSlashGhostText('open /usr/bin', 9, 'agent'), null);
  assert.deepEqual(applyMidInputSlashCompletion('please /pla', 11, 'agent'), {
    input: 'please /plan ',
    cursorOffset: 13,
    completedCommand: '/plan',
  });
  assert.deepEqual(applyMidInputSlashCompletion('please /pla then continue', 11, 'agent'), {
    input: 'please /plan  then continue',
    cursorOffset: 13,
    completedCommand: '/plan',
  });
  assert.equal(applyMidInputSlashCompletion('/pla', 4, 'agent'), null);
  assert.equal(applyMidInputSlashCompletion('open /usr/bin', 9, 'agent'), null);

  const positions = findSlashCommandPositions('try /plan then /model info');
  assert.deepEqual(positions.slice(0, 2), [
    { start: 4, end: 9 },
    { start: 15, end: 21 },
  ]);
});

test('slash typeahead selection cycles and applies tab versus enter actions', () => {
  const { createSlashTypeaheadState, moveSlashSelection, applySlashSelection } = require('../dist/chat/typeahead');

  const state = createSlashTypeaheadState('/', 'agent');
  const movedUp = moveSlashSelection(state, -1);
  assert.equal(movedUp.selectedIndex, state.suggestions.length - 1);

  const movedDown = moveSlashSelection(movedUp, 1);
  assert.equal(movedDown.selectedIndex, 0);

  assert.deepEqual(applySlashSelection(movedDown, 'tab'), {
    action: 'complete',
    input: movedDown.suggestions[0].command + ' ',
  });
  assert.deepEqual(applySlashSelection(movedDown, 'enter'), {
    action: 'execute',
    input: movedDown.suggestions[0].command,
  });
});

test('slash completion keeps argument hints display-only', () => {
  const { createSlashTypeaheadState, applySlashSelection, renderSlashTypeahead } = require('../dist/chat/typeahead');

  const state = createSlashTypeaheadState('/agent s', 'agent');
  const rendered = renderSlashTypeahead(state).replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

  assert.match(rendered, /\/agent spawn <task>/);
  assert.deepEqual(applySlashSelection(state, 'tab'), {
    action: 'complete',
    input: '/agent spawn ',
  });
  assert.deepEqual(applySlashSelection(state, 'enter'), {
    action: 'execute',
    input: '/agent spawn',
  });
});

test('slash typeahead hides command suggestions after trailing space for arguments', () => {
  const { createSlashTypeaheadState } = require('../dist/chat/typeahead');

  const waitingForArgs = createSlashTypeaheadState('/agent spawn ', 'agent');
  const completeModel = createSlashTypeaheadState('/model ', 'agent');

  assert.equal(waitingForArgs.active, false);
  assert.equal(waitingForArgs.suggestions.length, 0);
  assert.equal(completeModel.active, false);
  assert.equal(completeModel.suggestions.length, 0);
});

test('slash typeahead dismisses before global exit confirmation', () => {
  const { createSlashTypeaheadState, dismissSlashTypeahead } = require('../dist/chat/typeahead');
  const state = createSlashTypeaheadState('/agent', 'agent');
  const dismissed = dismissSlashTypeahead(state);

  assert.equal(state.active, true);
  assert.equal(dismissed.active, false);
  assert.equal(dismissed.suggestions.length, 0);
});

test('chat runtime references slash typeahead prompt controller', () => {
  const source = fs.readFileSync('src/chat/index.ts', 'utf8');

  assert.match(source, /promptWithSlashTypeahead/);
  assert.match(source, /onOverlayChange/);
  assert.match(source, /session\.inSubmenu/);
});

test('slash prompt reports overlay active while suggestions are visible', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const output = { write: () => undefined };
  const overlay = [];

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
    onOverlayChange: (active) => overlay.push(active),
  });

  input.emit('keypress', '/', { name: undefined });
  input.emit('keypress', undefined, { name: 'escape' });
  input.emit('keypress', undefined, { name: 'return' });

  await pending;
  assert.deepEqual(overlay.slice(0, 2), [true, false]);
});

test('slash prompt lets ctrl-c dismiss suggestions before exit handling', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const output = { write: () => undefined };
  const overlay = [];

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
    onOverlayChange: (active) => overlay.push(active),
  });

  input.emit('keypress', '/', { name: undefined });
  input.emit('keypress', undefined, { name: 'c', ctrl: true });
  input.emit('keypress', undefined, { name: 'return' });

  const value = await pending;
  assert.equal(value, '/');
  assert.deepEqual(overlay.slice(0, 2), [true, false]);
});

test('slash prompt leaves shift-tab for global mode cycling', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const output = { write: () => undefined };

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
  });

  input.emit('keypress', '/', { name: undefined });
  input.emit('keypress', undefined, { name: 'tab', shift: true });
  input.emit('keypress', undefined, { name: 'return' });

  assert.equal(await pending, '/');
});

test('slash prompt applies mid-input slash completion on tab', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const output = { write: () => undefined };

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
  });

  for (const char of 'please /pla') {
    input.emit('keypress', char, { name: undefined });
  }
  input.emit('keypress', undefined, { name: 'tab' });
  input.emit('keypress', undefined, { name: 'return' });

  assert.equal(await pending, 'please /plan ');
});

test('slash prompt renders mid-input ghost text without submitting it', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const writes = [];
  const output = { write: (chunk) => { writes.push(String(chunk)); } };

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
  });

  for (const char of 'please /pla') {
    input.emit('keypress', char, { name: undefined });
  }
  input.emit('keypress', undefined, { name: 'return' });

  const rendered = writes.join('').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  assert.match(rendered, /please \/plan/);
  assert.equal(await pending, 'please /pla');
});

test('slash prompt keeps pasted urls and Chinese text single-line on narrow terminals', () => {
  const {
    formatPromptInputForDisplay,
    sanitizePromptInsert,
  } = require('../dist/chat/typeahead');
  const { visibleLength } = require('../dist/chat/ui/theme');

  const pasted = sanitizePromptInsert('第一行：https://example.com/path\r\n第二行：继续测试\t完成');
  const rendered = formatPromptInputForDisplay(pasted, '> ', 24);

  assert.equal(pasted, '第一行：https://example.com/path 第二行：继续测试 完成');
  assert.match(rendered, /^…/);
  assert.ok(visibleLength('> ' + rendered) <= 24, `prompt display too wide: ${rendered}`);
  assert.match(rendered, /完成$/);
});

test('slash prompt clears suggestion rows below the prompt when moving selection', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const writes = [];
  const output = {
    columns: 80,
    write: (chunk) => { writes.push(String(chunk)); },
  };

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
  });

  input.emit('keypress', '/', { name: undefined });
  input.emit('keypress', undefined, { name: 'down' });
  input.emit('keypress', undefined, { name: 'down' });
  input.emit('keypress', undefined, { name: 'return' });

  await pending;
  const rawWrites = writes.join('');
  assert.match(rawWrites, /\x1B\[1B\r\x1B\[2K/);
  assert.doesNotMatch(rawWrites, /\x1B\[1A\x1B\[2K/);
});

test('slash prompt redraw does not repeat a leading prompt newline on every keypress', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const writes = [];
  const output = {
    columns: 80,
    write: (chunk) => { writes.push(String(chunk)); },
  };

  const pending = promptWithSlashTypeahead({
    prompt: '\n  ❯ ',
    mode: 'agent',
    input,
    output,
  });

  for (const char of 'https://example.com') {
    input.emit('keypress', char, { name: undefined });
  }
  input.emit('keypress', undefined, { name: 'return' });

  assert.equal(await pending, 'https://example.com');
  const rawWrites = writes.join('');
  assert.doesNotMatch(rawWrites, /\r\x1B\[2K\n  ❯/);
});

test('slash prompt abort cleans up keypress listener and resolves pending input', async () => {
  const { promptWithSlashTypeahead } = require('../dist/chat/typeahead');
  const input = new EventEmitter();
  input.isRaw = false;
  input.setRawMode = () => undefined;
  input.resume = () => undefined;
  const output = { write: () => undefined };
  const controller = new AbortController();

  const pending = promptWithSlashTypeahead({
    prompt: '> ',
    mode: 'agent',
    input,
    output,
    signal: controller.signal,
  });

  assert.equal(input.listenerCount('keypress'), 1);
  controller.abort();
  assert.equal(await pending, '');
  assert.equal(input.listenerCount('keypress'), 0);
});
