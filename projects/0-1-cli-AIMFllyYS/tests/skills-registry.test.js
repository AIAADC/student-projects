const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('skills registry includes required marketplace skills', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { SKILL_MARKETPLACE } = require('../dist/modules/skills');

  const keys = SKILL_MARKETPLACE.map((skill) => skill.key);
  assert.ok(keys.includes('superpowers'));
  assert.ok(keys.includes('agent-onboarding'));
});

test('skills targets include cli and global destinations', () => {
  const { getSkillTargets } = require('../dist/modules/skills');
  const keys = getSkillTargets().map((target) => target.key);

  for (const key of ['claude', 'codex', 'cursor', 'global']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }
});

test('slash command registry exposes runtime skills search', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { getSlashCommandDefinitions, resolveSkillsCommand } = require('../dist/chat/commands');

  const searchCommand = getSlashCommandDefinitions('agent').find((item) => item.id === 'skills-search');
  assert.ok(searchCommand);
  assert.match(searchCommand.command, /\/skills search/);

  assert.deepEqual(resolveSkillsCommand('search pdf'), { kind: 'search', query: 'pdf' });
  assert.deepEqual(resolveSkillsCommand(''), { kind: 'list' });
});
