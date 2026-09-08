const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

function makeSkill(root, name, content) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
  return dir;
}

test('runtime skills discover UTF-8 SKILL.md metadata from configured roots', () => {
  const { discoverRuntimeSkills, loadRuntimeSkillContent } = require('../dist/chat/skills');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-'));
  makeSkill(root, 'chinese-helper', '# 中文助手\n\ndescription: 保持 UTF-8，不要弄坏中文。\n\n完整说明。');

  const skills = discoverRuntimeSkills({ roots: [root] });

  assert.equal(skills.length, 1);
  assert.equal(skills[0].id, 'chinese-helper');
  assert.equal(skills[0].name, '中文助手');
  assert.match(skills[0].description, /UTF-8/);
  assert.equal('content' in skills[0], false);
  assert.match(loadRuntimeSkillContent(skills[0]).content, /不要弄坏中文/);
});

test('runtime skills dedupe by id and prefer the first root', () => {
  const { discoverRuntimeSkills } = require('../dist/chat/skills');
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-first-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-second-'));
  makeSkill(first, 'same', '# First\n\ndescription: first copy');
  makeSkill(second, 'same', '# Second\n\ndescription: second copy');

  const skills = discoverRuntimeSkills({ roots: [first, second] });

  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'First');
});

test('runtime skills discover nested installed layouts and frontmatter names', () => {
  const { discoverRuntimeSkills } = require('../dist/chat/skills');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-nested-'));
  makeSkill(path.join(root, 'superpowers'), 'using-superpowers', '---\nname: Using Superpowers\n---\n\ndescription: workflow skill');
  makeSkill(path.join(root, '.system'), 'imagegen', 'name: Image Generation\n\ndescription: raster images');

  const skills = discoverRuntimeSkills({ roots: [root] });

  assert.ok(skills.some((skill) => skill.id === 'using-superpowers' && skill.name === 'Using Superpowers'));
  assert.ok(skills.some((skill) => skill.id === 'imagegen' && skill.name === 'Image Generation'));
});

test('runtime skill commands list activate and clear skills', () => {
  const { discoverRuntimeSkills, formatSkillList, resolveSkillSelection } = require('../dist/chat/skills');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-command-'));
  makeSkill(root, 'code-review', '# Code Review\n\ndescription: review carefully');
  const skills = discoverRuntimeSkills({ roots: [root] });

  assert.match(formatSkillList(skills, []), /code-review/);
  assert.deepEqual(resolveSkillSelection('clear', skills), { kind: 'clear' });
  assert.equal(resolveSkillSelection('code', skills).skill.id, 'code-review');
  assert.equal(resolveSkillSelection('missing', skills).kind, 'missing');
});

test('active runtime skills are injected as user context with truncation', () => {
  const { formatSkillContextMessage, upsertSkillContextMessage } = require('../dist/chat/skills');
  const { getSystemPrompt } = require('../dist/chat/tools');
  const content = '# Long Skill\n' + 'A'.repeat(1200);
  const contextMessage = formatSkillContextMessage([{
    id: 'long',
    name: 'Long Skill',
    description: 'desc',
    path: 'x',
    skillFile: 'x/SKILL.md',
    content,
    truncated: false,
  }], { maxCharsPerSkill: 200 });
  const messages = [{ role: 'system', content: getSystemPrompt() }];
  upsertSkillContextMessage(messages, contextMessage);

  assert.equal(messages[0].role, 'system');
  assert.doesNotMatch(messages[0].content, /Active Skill Context/);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /## Active Skill Context/);
  assert.match(messages[1].content, /Long Skill/);
  assert.match(messages[1].content, /truncated/);
  assert.ok(messages[1].content.includes('A'.repeat(100)));
  assert.ok(!messages[1].content.includes('A'.repeat(500)));

  upsertSkillContextMessage(messages, null);
  assert.equal(messages.length, 1);
});

test('active skill context can be restored after conversation clear', () => {
  const { formatSkillContextMessage, upsertSkillContextMessage } = require('../dist/chat/skills');
  const { getSystemPrompt } = require('../dist/chat/tools');
  const active = [{
    id: 'review',
    name: 'Review',
    description: 'desc',
    path: 'x',
    skillFile: 'x/SKILL.md',
    content: '# Review\nKeep context after clear.',
    truncated: false,
  }];
  const messages = [
    { role: 'system', content: getSystemPrompt() },
    formatSkillContextMessage(active),
    { role: 'user', content: 'old turn' },
    { role: 'assistant', content: 'old answer' },
  ].filter(Boolean);

  messages.length = 1;
  upsertSkillContextMessage(messages, formatSkillContextMessage(active));

  assert.equal(messages.length, 2);
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /Keep context after clear/);
});

test('history trimming preserves active skill context', () => {
  const { formatSkillContextMessage, trimMessagesPreservingSkillContext } = require('../dist/chat/skills');
  const { getSystemPrompt } = require('../dist/chat/tools');
  const context = formatSkillContextMessage([{
    id: 'review',
    name: 'Review',
    description: 'desc',
    path: 'x',
    skillFile: 'x/SKILL.md',
    content: '# Review\nStay active during trim.',
    truncated: false,
  }]);
  const messages = [{ role: 'system', content: getSystemPrompt() }, context].filter(Boolean);
  for (let i = 0; i < 30; i += 1) {
    messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `turn ${i}` });
  }

  trimMessagesPreservingSkillContext(messages, 20);

  assert.equal(messages.length, 20);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /Active Skill Context/);
  assert.match(messages[19].content, /turn 29/);
});

test('default runtime skill roots include project-local .0-1-cli skills', () => {
  const { getDefaultSkillRoots } = require('../dist/chat/skills');
  const roots = getDefaultSkillRoots({ USERPROFILE: 'C:\\Users\\tester', HOME: '', HI_SKILLS_PATH: '' });

  assert.ok(roots.some((root) => root.endsWith(path.join('.0-1-cli', 'skills'))));
});

test('loadRuntimeSkillContent reads bounded content only when activated', () => {
  const { discoverRuntimeSkills, loadRuntimeSkillContent } = require('../dist/chat/skills');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-large-'));
  makeSkill(root, 'large', '# Large\n\ndescription: large\n\n' + 'B'.repeat(50000));

  const [skill] = discoverRuntimeSkills({ roots: [root] });
  const loaded = loadRuntimeSkillContent(skill, { maxChars: 256 });

  assert.equal(loaded.content.length, 256);
  assert.equal(loaded.truncated, true);
});

test('runtime skills parse YAML frontmatter including when_to_use trigger text', () => {
  const { discoverRuntimeSkills } = require('../dist/chat/skills');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-skills-frontmatter-'));
  makeSkill(root, 'pdf-helper', [
    '---',
    'name: PDF Helper',
    'description: Extract and summarize PDF files',
    'when_to_use: Use when the user mentions PDFs, forms, or scanned documents',
    '---',
    '',
    '# PDF Helper',
    '',
    'Full body should not be required for metadata.',
  ].join('\n'));

  const [skill] = discoverRuntimeSkills({ roots: [root] });

  assert.equal(skill.name, 'PDF Helper');
  assert.match(skill.description, /PDF files/);
  assert.match(skill.whenToUse, /scanned documents/);
  assert.equal('content' in skill, false);
});

test('searchRuntimeSkills ranks id matches ahead of description-only matches', () => {
  const { searchRuntimeSkills } = require('../dist/chat/skills');
  const skills = [
    {
      id: 'alpha',
      name: 'Alpha',
      description: 'mentions beta in description',
      whenToUse: '',
      path: 'a',
      skillFile: 'a/SKILL.md',
    },
    {
      id: 'beta-tool',
      name: 'Beta Tool',
      description: 'does beta things',
      whenToUse: '',
      path: 'b',
      skillFile: 'b/SKILL.md',
    },
  ];

  const results = searchRuntimeSkills('beta', skills);

  assert.equal(results.length, 2);
  assert.equal(results[0].skill.id, 'beta-tool');
});

test('searchRuntimeSkills matches trigger text from when_to_use', () => {
  const { searchRuntimeSkills } = require('../dist/chat/skills');
  const skills = [
    {
      id: 'onboarding',
      name: 'Onboarding',
      description: 'Guide new users',
      whenToUse: 'Use when the user says they are a beginner or first-time user',
      path: 'x',
      skillFile: 'x/SKILL.md',
    },
  ];

  const results = searchRuntimeSkills('first-time', skills);

  assert.equal(results.length, 1);
  assert.equal(results[0].skill.id, 'onboarding');
});

test('resolveSkillSelection prefers the highest ranked search match', () => {
  const { resolveSkillSelection } = require('../dist/chat/skills');
  const skills = [
    {
      id: 'docs',
      name: 'Docs',
      description: 'Write documentation for APIs',
      whenToUse: '',
      path: 'd',
      skillFile: 'd/SKILL.md',
    },
    {
      id: 'api-review',
      name: 'API Review',
      description: 'Review API changes',
      whenToUse: '',
      path: 'a',
      skillFile: 'a/SKILL.md',
    },
  ];

  assert.equal(resolveSkillSelection('api', skills).skill.id, 'api-review');
});

test('formatSkillSearchResults renders ranked matches for slash search', () => {
  const { formatSkillSearchResults } = require('../dist/chat/skills');
  const output = formatSkillSearchResults('pdf', [
    {
      skill: {
        id: 'pdf',
        name: 'PDF',
        description: 'Work with PDF files',
        whenToUse: 'Use for PDF tasks',
        path: 'p',
        skillFile: 'p/SKILL.md',
      },
      score: 900,
    },
  ]);

  assert.match(output, /pdf/);
  assert.match(output, /PDF tasks/);
});
