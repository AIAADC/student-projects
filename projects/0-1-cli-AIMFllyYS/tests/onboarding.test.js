const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('default guide explains CLI onboarding in plain Chinese', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { DEFAULT_GUIDE_KEY, GUIDE_CHAPTERS, renderGuideChapter } = require('../dist/modules/guide');

  const intro = renderGuideChapter(DEFAULT_GUIDE_KEY);
  const keys = GUIDE_CHAPTERS.map((chapter) => chapter.key);

  assert.match(intro, /Claude Code/);
  assert.match(intro, /hi --install -cc/);
  assert.match(intro, /不要害怕/);
  assert.ok(keys.includes('cc-switch'));
  assert.ok(keys.includes('vpn'));
  assert.ok(keys.includes('community'));
});

test('hi startup prints logo and zero-one welcome copy once before guide', () => {
  const output = execFileSync('node', ['dist/index.js'], { encoding: 'utf8' });

  assert.match(output, /██████╗\s+██╗\s+██████╗██╗\s+██╗/);
  assert.match(output, /0-1 CLI v0\.7\.0/);
  assert.match(output, /树林曾云：从0到1是最贵的/);
  assert.match(output, /希望这个CLI可以帮助你从0到1入门AI-CLI工具/);
  assert.equal((output.match(/0-1 CLI v0\.7\.0/g) || []).length, 1);
});

test('unhandled hi arguments print help instead of the default guide', () => {
  const positional = execFileSync('node', ['dist/index.js', 'whatever'], { encoding: 'utf8' });
  const orphanTask = execFileSync('node', ['dist/index.js', '--task', 'demo'], { encoding: 'utf8' });

  for (const output of [positional, orphanTask]) {
    assert.match(output, /用法：hi \[选项\]/);
    assert.match(output, /--state/);
    assert.match(output, /--api/);
    assert.doesNotMatch(output, /树林曾云：从0到1是最贵的/);
  }
});

test('guide menu keeps three switch targets and shows main chapter away from intro', () => {
  const { DEFAULT_GUIDE_KEY, getGuideMenuOptions } = require('../dist/modules/guide');

  const introOptions = getGuideMenuOptions(DEFAULT_GUIDE_KEY);
  assert.equal(introOptions.length, 3);
  assert.deepEqual(introOptions.map((option) => option.value).sort(), ['cc-switch', 'community', 'vpn']);

  const ccSwitchOptions = getGuideMenuOptions('cc-switch');
  assert.equal(ccSwitchOptions.length, 3);
  assert.ok(ccSwitchOptions.some((option) => option.value === DEFAULT_GUIDE_KEY && option.label.includes('主章节')));
  assert.ok(!ccSwitchOptions.some((option) => option.value === 'cc-switch'));
});

test('guide chapters have distinct theme colors', () => {
  const { GUIDE_CHAPTERS, getGuideChapterColorName } = require('../dist/modules/guide');
  const colors = GUIDE_CHAPTERS.map((chapter) => getGuideChapterColorName(chapter.key));

  assert.equal(colors.length, 4);
  assert.equal(new Set(colors).size, 4);
  assert.deepEqual(colors, ['cyan', 'magenta', 'yellow', 'green']);
});

test('help exposes state, api, and pay routes', () => {
  const help = execFileSync('node', ['dist/index.js', '--help'], { encoding: 'utf8' });

  assert.match(help, /用法：hi \[选项\]/);
  assert.match(help, /选项：/);
  assert.match(help, /显示版本号/);
  assert.match(help, /显示帮助信息/);
  assert.match(help, /打开新手讲解模式/);
  assert.match(help, /--state/);
  assert.match(help, /--api/);
  assert.match(help, /--pay/);
  assert.doesNotMatch(help, /Usage: hi/);
  assert.doesNotMatch(help, /Options:/);
  assert.doesNotMatch(help, /display help for command/);
});
