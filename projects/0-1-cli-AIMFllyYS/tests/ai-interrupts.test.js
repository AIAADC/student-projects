const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

test('interrupt controller requires repeated exit confirmation', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.deepEqual(controller.handle({ running: false, now: 1000 }), { action: 'confirm-exit' });
  assert.deepEqual(controller.handle({ running: false, now: 1200 }), { action: 'exit' });
});

test('first interrupt cancels running work instead of exiting', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.deepEqual(controller.handle({ running: true, now: 1000 }), { action: 'cancel-running' });
  assert.deepEqual(controller.handle({ running: false, now: 2500 }), { action: 'confirm-exit' });
});

test('escape in a submenu goes back before exit confirmation', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.deepEqual(controller.handle({ running: false, inSubmenu: true, now: 1000 }), { action: 'back' });
  assert.deepEqual(controller.handle({ running: false, now: 1000 }), { action: 'confirm-exit' });
});

test('pending input controller resolves waiting prompt on exit', async () => {
  const { createPendingInputController } = require('../dist/chat/interrupts');
  const pending = createPendingInputController();

  const answer = pending.wait((resolve) => {
    pending.resolveOnExit();
    resolve('late input');
  });

  assert.equal(await answer, '');
});

test('pending input controller resolves future prompts after exit starts', async () => {
  const { createPendingInputController } = require('../dist/chat/interrupts');
  const pending = createPendingInputController();

  pending.resolveOnExit();
  const answer = await pending.wait(() => {
    throw new Error('future prompt should not register after exit');
  });

  assert.equal(answer, '');
});

test('exit confirmation expires after the confirm window', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.deepEqual(controller.handle({ running: false, now: 1000 }), { action: 'confirm-exit' });
  assert.deepEqual(controller.handle({ running: false, now: 2500 }), { action: 'confirm-exit' });
});

test('formatInterruptedMessage renders provider-neutral interrupted copy', () => {
  const { formatInterruptedMessage } = require('../dist/chat/interrupts');

  assert.match(formatInterruptedMessage(), /Interrupted/);
  assert.match(formatInterruptedMessage(), /接下来/);
  assert.doesNotMatch(formatInterruptedMessage(), /Anthropic|\/issue|oauth|telemetry/i);
});
