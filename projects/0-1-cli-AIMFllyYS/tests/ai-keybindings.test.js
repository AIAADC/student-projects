const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('keybinding parser normalizes Claude-style keystroke strings', () => {
  const { parseKeystroke, keystrokeToString } = require('../dist/chat/keybindings');

  assert.deepEqual(parseKeystroke('ctrl+shift+k'), {
    key: 'k',
    ctrl: true,
    alt: false,
    shift: true,
    meta: false,
  });
  assert.equal(parseKeystroke('esc').key, 'escape');
  assert.equal(parseKeystroke('return').key, 'enter');
  assert.equal(parseKeystroke('space').key, ' ');
  assert.equal(keystrokeToString(parseKeystroke('ctrl+shift+k')), 'ctrl+shift+k');
});

test('slash prompt key resolver maps readline keys to prompt actions', () => {
  const { resolveSlashPromptKeyAction } = require('../dist/chat/keybindings');

  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'escape' }, true), { action: 'dismiss-suggestions' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'c', ctrl: true }, true), { action: 'dismiss-suggestions' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'up' }, true), { action: 'move-selection', delta: -1 });
  assert.deepEqual(resolveSlashPromptKeyAction('k', { name: 'k' }, true), { action: 'move-selection', delta: -1 });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'down' }, true), { action: 'move-selection', delta: 1 });
  assert.deepEqual(resolveSlashPromptKeyAction('j', { name: 'j' }, true), { action: 'move-selection', delta: 1 });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'tab' }, true), { action: 'complete-selection' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'tab' }, false), { action: 'complete-mid-input' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'tab', shift: true }, true), { action: 'dismiss-suggestions' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'return' }, true), { action: 'submit' });
  assert.deepEqual(resolveSlashPromptKeyAction(undefined, { name: 'backspace' }, false), { action: 'backspace' });
  assert.deepEqual(resolveSlashPromptKeyAction('x', { name: 'x' }, false), { action: 'insert', value: 'x' });
  assert.deepEqual(resolveSlashPromptKeyAction('x', { name: 'x', ctrl: true }, false), { action: 'none' });
});

test('slash prompt delegates key branching to keybinding resolver', () => {
  const source = fs.readFileSync('src/chat/typeahead.ts', 'utf8');

  assert.match(source, /resolveSlashPromptKeyAction/);
  assert.match(source, /resolveOverlayDismissKeyAction/);
});

test('overlay dismiss keys close suggestions before global exit confirmation', () => {
  const { resolveOverlayDismissKeyAction, isGlobalInterruptKey } = require('../dist/chat/keybindings');

  assert.deepEqual(resolveOverlayDismissKeyAction(undefined, { name: 'escape' }, true), { action: 'dismiss-overlay' });
  assert.deepEqual(resolveOverlayDismissKeyAction(undefined, { name: 'c', ctrl: true }, true), { action: 'dismiss-overlay' });
  assert.deepEqual(resolveOverlayDismissKeyAction(undefined, { name: 'escape' }, false), { action: 'none' });
  assert.equal(isGlobalInterruptKey(undefined, { name: 'escape' }), true);
  assert.equal(isGlobalInterruptKey(undefined, { name: 'c', ctrl: true }), true);
  assert.equal(isGlobalInterruptKey('x', { name: 'x' }), false);
});
