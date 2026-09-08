import * as readline from 'readline';
import { interactiveSelect } from '../../utils/selector';
import { openUrl } from '../../utils/open-url';
import { renderMarkdown } from '../../utils/markdown';
import { API_PROVIDERS, ApiProvider } from './registry';

export { API_PROVIDERS };

const linkLabels: Record<string, string> = {
  developer: '开发者平台',
  console: '控制台',
  docs: '官方文档',
  models: '模型列表',
  pricing: '价格 / Token 计费',
  tokenPlan: 'Token Plan / 套餐',
  openaiCompatible: 'OpenAI 兼容',
  anthropicCompatible: 'Anthropic 兼容',
  unifiedApi: '统一调用 / 原生调用',
};

function askEnter(): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('按 Enter 打开默认开发者平台，输入其他内容取消: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function linksMarkdown(provider: ApiProvider): string[] {
  const lines: string[] = ['### 官方链接', ''];
  for (const [key, value] of Object.entries(provider.links)) {
    if (!value) continue;
    lines.push(`- ${linkLabels[key] || key}: <${value}>`);
  }
  lines.push('');
  return lines;
}

function compatibilityMarkdown(provider: ApiProvider): string[] {
  return [
    '### 兼容性说明',
    '',
    '| 协议 | 说明 |',
    '| --- | --- |',
    `| 原生 / 默认 | ${provider.compatibility.native.replace(/\|/g, '\\|')} |`,
    `| OpenAI 兼容 | ${provider.compatibility.openai.replace(/\|/g, '\\|')} |`,
    `| Anthropic 兼容 | ${provider.compatibility.anthropic.replace(/\|/g, '\\|')} |`,
    '',
  ];
}

function providerMarkdown(provider: ApiProvider): string {
  const md: string[] = [
    `## ${provider.name}`,
    '',
    `- 当前可证实主推模型：${provider.topModel}`,
    `- 资料核查日期：${provider.evidenceDate}`,
    '',
    provider.description,
    '',
    ...linksMarkdown(provider),
    ...compatibilityMarkdown(provider),
  ];
  if (provider.notes.length > 0) {
    md.push('### 谨慎说明', '');
    provider.notes.forEach((note) => md.push(`- ${note}`));
  }
  return md.join('\n');
}

function printProvider(provider: ApiProvider): void {
  console.log(renderMarkdown(providerMarkdown(provider)));
}

export async function handleApiGuide(): Promise<void> {
  if (!process.stdin.isTTY) {
    API_PROVIDERS.forEach(printProvider);
    return;
  }

  let selectedKey = '';
  await interactiveSelect({
    title: '选择模型 API 平台',
    options: API_PROVIDERS.map((provider) => ({
      label: provider.name,
      value: provider.key,
      description: provider.topModel,
    })),
    onSelect: (value) => {
      selectedKey = value;
    },
  });

  const selected = API_PROVIDERS.find((provider) => provider.key === selectedKey);
  if (!selected) return;
  printProvider(selected);
  if ((await askEnter()).trim() === '') openUrl(selected.url);
}