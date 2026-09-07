const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('api provider registry includes required platforms and current official API metadata', () => {
  execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });
  const { API_PROVIDERS } = require('../dist/modules/api');
  const keys = API_PROVIDERS.map((provider) => provider.key);

  for (const key of ['glm', 'kimi', 'deepseek', 'mimo', 'doubao', 'bailian', 'openai', 'google', 'grok', 'claude', 'minimax']) {
    assert.ok(keys.includes(key), `missing ${key}`);
  }

  for (const provider of API_PROVIDERS) {
    assert.ok(provider.links.developer, `${provider.key} missing developer URL`);
    assert.ok(provider.links.docs, `${provider.key} missing docs URL`);
    assert.ok(provider.links.pricing || provider.links.tokenPlan, `${provider.key} missing pricing or token plan URL`);
    assert.ok(provider.compatibility.openai, `${provider.key} missing OpenAI compatibility statement`);
    assert.ok(provider.compatibility.anthropic, `${provider.key} missing Anthropic compatibility statement`);
    assert.ok(provider.evidenceDate, `${provider.key} missing evidence date`);
  }

  assert.match(API_PROVIDERS.find((provider) => provider.key === 'glm').topModel, /GLM-5\.2/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'kimi').topModel, /Kimi K2\.7 Code/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'deepseek').topModel, /deepseek-v4-(pro|flash)/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'mimo').topModel, /mimo-v2\.5-pro/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'bailian').topModel, /qwen3\.7/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'openai').topModel, /gpt-5\.5/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'google').topModel, /Gemini 3\.5/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'grok').topModel, /Grok 4\.3/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'claude').topModel, /Claude Fable 5/);
  assert.match(API_PROVIDERS.find((provider) => provider.key === 'minimax').topModel, /MiniMax-M3/);
});

test('api registry includes official compatibility and plan links where available', () => {
  const { API_PROVIDERS } = require('../dist/modules/api');
  const byKey = Object.fromEntries(API_PROVIDERS.map((provider) => [provider.key, provider]));

  assert.equal(byKey.glm.links.openaiCompatible, 'https://docs.z.ai/guides/develop/openai/python');
  assert.equal(byKey.glm.links.anthropicCompatible, 'https://docs.z.ai/devpack/tool/others');
  assert.equal(byKey.kimi.links.openaiCompatible, 'https://platform.kimi.com/docs/guide/agent-support');
  assert.equal(byKey.kimi.links.anthropicCompatible, 'https://platform.kimi.com/docs/guide/agent-support');
  assert.equal(byKey.deepseek.links.anthropicCompatible, 'https://api-docs.deepseek.com/guides/anthropic_api');
  assert.equal(byKey.mimo.links.anthropicCompatible, 'https://mimo.mi.com/docs/en-US/api/chat/anthropic-api');
  assert.equal(byKey.doubao.links.anthropicCompatible, 'https://www.volcengine.com/docs/82379/2160841');
  assert.equal(byKey.bailian.links.anthropicCompatible, 'https://help.aliyun.com/zh/model-studio/anthropic-api-messages');
  assert.equal(byKey.google.links.openaiCompatible, 'https://ai.google.dev/gemini-api/docs/openai');
  assert.equal(byKey.claude.links.openaiCompatible, 'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk');
  assert.equal(byKey.minimax.links.tokenPlan, 'https://platform.minimax.io/docs/guides/pricing-token-plan');

  assert.match(byKey.openai.compatibility.anthropic, /官方未见/);
  assert.match(byKey.google.compatibility.anthropic, /官方未见/);
  assert.match(byKey.grok.compatibility.anthropic, /官方未见/);
});

test('pay registry includes requested payment and relay links', () => {
  const { PAY_RESOURCES } = require('../dist/modules/pay');
  const urls = PAY_RESOURCES.map((resource) => resource.url);

  assert.ok(urls.includes('https://www.supaycard.com/landingView?ref=vggONf'));
  assert.ok(urls.includes('https://www.recode.cat/?aff=YH6TPFDV'));
  assert.ok(urls.includes('https://aisou.pro/'));
  assert.ok(urls.includes('https://apikey.fun/register?aff=N3FM3989JUX8'));
});

test('install registry includes Clash Verge and CC Switch links', () => {
  const { ENV_INSTALL_TARGETS, IDE_INSTALL_TARGETS } = require('../dist/modules/install');
  const all = [...ENV_INSTALL_TARGETS, ...IDE_INSTALL_TARGETS];
  const urls = all.map((target) => target.installUrl || target.sourceUrl);

  assert.ok(urls.includes('https://www.sibker.com/client/Clash.Verge_2.4.7_x64-setup.exe'));
  assert.ok(urls.includes('https://www.sibker.com/client/Clash.Verge_2.4.7_x64.dmg'));
  assert.ok(urls.includes('https://www.sibker.com/client/Clash.Verge_2.4.7_aarch64.dmg'));
  assert.ok(urls.includes('https://github.com/farion1231/cc-switch/releases/download/v3.16.2/CC-Switch-v3.16.2-Windows.msi'));
  assert.ok(urls.includes('https://github.com/farion1231/cc-switch/releases/download/v3.16.2/CC-Switch-v3.16.2-macOS.dmg'));
});