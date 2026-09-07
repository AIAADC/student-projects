export interface PayResource {
  key: string;
  name: string;
  url: string;
  description: string;
}

export const PAY_RESOURCES: PayResource[] = [
  { key: 'supay', name: 'SupayCard 虚拟卡', url: 'https://www.supaycard.com/landingView?ref=vggONf', description: '较稳定的虚拟卡资源，可用于部分海外订阅场景。' },
  { key: 'recode', name: 'Recode Claude 中转', url: 'https://www.recode.cat/?aff=YH6TPFDV', description: 'Claude 极安全非传统拼车中转平台。' },
  { key: 'aisou', name: 'AiSou 代充平台', url: 'https://aisou.pro/', description: '目前比较稳定，适合新手了解代充流程。' },
  { key: 'orionkey', name: 'OrionKey 代充平台', url: 'https://www.orionkey.shop/', description: '其他相对稳定的代充平台之一。' },
  { key: 'bcai', name: 'BCAI 代充平台', url: 'https://www.bcai.store/', description: '其他相对稳定的代充平台之一。' },
  { key: 'apikey-fun', name: 'APIKey.fun AI 中转', url: 'https://apikey.fun/register?aff=N3FM3989JUX8', description: '目前在用较稳定的 AI API 中转平台。' },
  { key: 'llm-token', name: 'LLM Token AI 中转', url: 'https://llm-token.cn/r/INV40EB01B7', description: '另一个比较靠谱的 AI API 中转平台。' },
];
