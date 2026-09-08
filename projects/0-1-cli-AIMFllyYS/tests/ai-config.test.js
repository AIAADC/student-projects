const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const test = require('node:test');

test('env example documents custom AI provider settings', () => {
  const env = readFileSync('.env.example', 'utf8');

  assert.match(env, /AI_BASE_URL=/);
  assert.match(env, /AI_API_KEY=/);
  assert.match(env, /AI_MODELS=/);
  assert.match(env, /AI_MODEL=/);
  assert.match(env, /English commas|英文逗号/);
});

test('provider prefers custom env URL, key, and model', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  process.env.AI_BASE_URL = 'https://example.com/v1';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'custom-model';

  const { getProviderConfig } = require('../dist/chat/provider');
  const provider = getProviderConfig({ id: 'deepseek-chat', provider: 'deepseek' });

  assert.equal(provider.hostname, 'example.com');
  assert.equal(provider.path, '/v1/chat/completions');
  assert.equal(provider.key, 'test-key');
  assert.equal(provider.modelId, 'custom-model');
});
