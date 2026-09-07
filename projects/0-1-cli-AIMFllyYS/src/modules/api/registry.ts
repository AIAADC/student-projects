export interface ApiProviderLinks {
  developer: string;
  docs: string;
  pricing?: string;
  tokenPlan?: string;
  models?: string;
  openaiCompatible?: string;
  anthropicCompatible?: string;
  unifiedApi?: string;
  console?: string;
}

export interface ApiCompatibility {
  native: string;
  openai: string;
  anthropic: string;
}

export interface ApiProvider {
  key: string;
  name: string;
  url: string;
  topModel: string;
  description: string;
  evidenceDate: string;
  links: ApiProviderLinks;
  compatibility: ApiCompatibility;
  notes: string[];
}

const evidenceDate = '2026-06-13';

export const API_PROVIDERS: ApiProvider[] = [
  {
    key: 'glm',
    name: 'Z.ai / GLM',
    url: 'https://z.ai',
    topModel: 'GLM-5.2（Coding Plan 可证实；通用 API 价格页仍以 GLM-5.1 为主）',
    description: '适合中文、长上下文、Agent 和代码任务。GLM-5.2 已在官方 Coding Plan 文档中出现，但通用 API 可用性要以控制台和价格页为准。',
    evidenceDate,
    links: {
      developer: 'https://z.ai',
      docs: 'https://docs.z.ai/guides/overview/quick-start',
      models: 'https://docs.z.ai/devpack/latest-model',
      pricing: 'https://docs.z.ai/guides/overview/pricing',
      tokenPlan: 'https://docs.z.ai/devpack/overview',
      openaiCompatible: 'https://docs.z.ai/guides/develop/openai/python',
      anthropicCompatible: 'https://docs.z.ai/devpack/tool/others',
    },
    compatibility: {
      native: 'Z.ai 原生 API；通用 OpenAI 兼容 Base URL 可按官方文档配置为 https://api.z.ai/api/paas/v4/。',
      openai: '官方提供 OpenAI SDK / OpenAI 协议兼容说明；Coding Plan 工具集成示例使用 https://api.z.ai/api/coding/paas/v4。',
      anthropic: '官方 Coding Plan 工具集成文档列出 Anthropic 协议入口 https://api.z.ai/api/anthropic。',
    },
    notes: ['GLM-5.2 不是随口猜测：官方最新模型切换/工具集成文档可证实；但新手生产接入仍应先看控制台是否开放。'],
  },
  {
    key: 'kimi',
    name: 'Kimi / Moonshot',
    url: 'https://platform.kimi.com',
    topModel: 'Kimi K2.7 Code / kimi-k2.7-code',
    description: 'Kimi 官方页面显示 K2.7 Code 已正式发布，并称为当前最强 Coding 模型；适合长上下文代码任务和工具调用。',
    evidenceDate,
    links: {
      developer: 'https://platform.kimi.com',
      console: 'https://platform.kimi.com/console',
      docs: 'https://platform.kimi.com/docs/overview',
      models: 'https://platform.kimi.com/docs/guide/model-list',
      pricing: 'https://platform.kimi.com/docs/pricing/chat',
      openaiCompatible: 'https://platform.kimi.com/docs/guide/agent-support',
      anthropicCompatible: 'https://platform.kimi.com/docs/guide/agent-support',
    },
    compatibility: {
      native: 'Kimi API 开放平台原生服务。',
      openai: '官方 Agent 支持文档给出 OpenAI 兼容接入，常用 Base URL 为 https://api.moonshot.cn/v1。',
      anthropic: '官方 Agent 支持文档给出 Claude Code / Anthropic 协议接入，Base URL 为 https://api.moonshot.cn/anthropic。',
    },
    notes: ['用户常说的 Kimi K2.7，官方更精确名称是 Kimi K2.7 Code / kimi-k2.7-code。'],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    url: 'https://platform.deepseek.com',
    topModel: 'deepseek-v4-pro / deepseek-v4-flash（V4 Preview）',
    description: 'DeepSeek 官方平台显示 V4 Preview；适合低成本 Agent、推理和代码任务，旧 deepseek-chat / deepseek-reasoner 有迁移风险。',
    evidenceDate,
    links: {
      developer: 'https://platform.deepseek.com',
      docs: 'https://api-docs.deepseek.com/',
      models: 'https://api-docs.deepseek.com/api/list-models',
      pricing: 'https://api-docs.deepseek.com/quick_start/pricing',
      openaiCompatible: 'https://api-docs.deepseek.com/',
      anthropicCompatible: 'https://api-docs.deepseek.com/guides/anthropic_api',
    },
    compatibility: {
      native: 'DeepSeek API 原生入口与官方文档以平台为准。',
      openai: '官方 Quick Start 使用 OpenAI 风格调用，Base URL 为 https://api.deepseek.com。',
      anthropic: '官方提供 Anthropic API 兼容文档，Base URL 为 https://api.deepseek.com/anthropic。',
    },
    notes: ['官方资料显示 deepseek-chat / deepseek-reasoner 为旧别名并存在弃用节点，新项目优先看 V4 显式模型名。'],
  },
  {
    key: 'mimo',
    name: 'Xiaomi MiMo',
    url: 'https://platform.xiaomimimo.com/',
    topModel: 'mimo-v2.5-pro',
    description: '小米 MiMo 官方 V2.5 系列面向复杂推理、深度分析和长文档；价格页显示 V2.5 是当前迁移方向。',
    evidenceDate,
    links: {
      developer: 'https://platform.xiaomimimo.com/',
      docs: 'https://mimo.mi.com/docs/en-US/quick-start/summary/model',
      models: 'https://mimo.mi.com/docs/en-US/quick-start/summary/model',
      pricing: 'https://mimo.mi.com/docs/en-US/price/pay-as-you-go',
      tokenPlan: 'https://platform.xiaomimimo.com/',
      openaiCompatible: 'https://mimo.mi.com/docs/en-US/api/chat/openai-api',
      anthropicCompatible: 'https://mimo.mi.com/docs/en-US/api/chat/anthropic-api',
    },
    compatibility: {
      native: 'MiMo API Open Platform 原生服务。',
      openai: '官方提供 OpenAI API Compatibility，接口路径为 https://api.xiaomimimo.com/v1/chat/completions。',
      anthropic: '官方提供 Anthropic API Compatibility，接口路径为 https://api.xiaomimimo.com/anthropic/v1/messages。',
    },
    notes: ['V2.5 系列在 2026-05/06 有价格和路由更新；以官方价格页和控制台实际可选模型为准。'],
  },
  {
    key: 'doubao',
    name: '火山方舟 / 豆包',
    url: 'https://console.volcengine.com/ark',
    topModel: 'Doubao Seed / Doubao Seed 2.0 系列',
    description: '火山方舟模型平台，适合国内账号、企业资源和多模型接入；具体可用模型以方舟模型列表和控制台为准。',
    evidenceDate,
    links: {
      developer: 'https://console.volcengine.com/ark',
      docs: 'https://www.volcengine.com/docs/82379/1399008',
      models: 'https://www.volcengine.com/docs/82379/1330310',
      pricing: 'https://www.volcengine.com/docs/82379/1544106',
      tokenPlan: 'https://www.volcengine.com/docs/82379/1925114',
      openaiCompatible: 'https://www.volcengine.com/docs/82379/2160841',
      anthropicCompatible: 'https://www.volcengine.com/docs/82379/2160841',
    },
    compatibility: {
      native: '火山方舟原生 API 与模型服务。',
      openai: '官方接入三方工具文档说明兼容 OpenAI，常规 OpenAI Base URL 通常为 https://ark.cn-beijing.volces.com/api/v3。',
      anthropic: '官方接入三方工具文档说明 Coding/Agent Plan 适配 Anthropic 协议，Base URL 示例为 https://ark.cn-beijing.volces.com/api/compatible。',
    },
    notes: ['方舟套餐、模型和抵扣系数更新频繁，新手要优先看控制台开通状态。'],
  },
  {
    key: 'bailian',
    name: '阿里云百炼 / Model Studio',
    url: 'https://bailian.console.aliyun.com/',
    topModel: 'qwen3.7-max / qwen3.7-plus（地域可用性以模型列表为准）',
    description: '阿里云百炼适合通义千问、企业云账号、Coding Plan 和 Token Plan 团队版接入。',
    evidenceDate,
    links: {
      developer: 'https://bailian.console.aliyun.com/',
      docs: 'https://help.aliyun.com/zh/model-studio/models',
      models: 'https://help.aliyun.com/zh/model-studio/models',
      pricing: 'https://help.aliyun.com/zh/model-studio/model-pricing',
      tokenPlan: 'https://help.aliyun.com/zh/model-studio/coding-plan',
      openaiCompatible: 'https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope',
      anthropicCompatible: 'https://help.aliyun.com/zh/model-studio/anthropic-api-messages',
    },
    compatibility: {
      native: 'DashScope / 百炼原生 API。',
      openai: '官方 OpenAI Chat 接口兼容文档说明可调整 API Key、BASE_URL 和模型名称迁移。',
      anthropic: '官方提供 Anthropic 兼容 Messages 文档；Coding Plan FAQ 也说明可接入支持 OpenAI / Anthropic 协议的插件。',
    },
    notes: ['qwen3.7-max、qwen3.7-plus 等模型的地域和版本差异明显，正式配置前看“选择模型”和“地域”页面。'],
  },
  {
    key: 'openai',
    name: 'OpenAI',
    url: 'https://platform.openai.com/',
    topModel: 'gpt-5.5 / gpt-5.5-pro',
    description: '官方模型页建议复杂推理和编码从 GPT-5.5 开始；适合复杂代码、工具调用、多模态和专业工作流。',
    evidenceDate,
    links: {
      developer: 'https://platform.openai.com/',
      docs: 'https://developers.openai.com/api/docs/models',
      models: 'https://developers.openai.com/api/docs/models',
      pricing: 'https://developers.openai.com/api/docs/pricing',
      openaiCompatible: 'https://developers.openai.com/api/docs/models',
    },
    compatibility: {
      native: 'OpenAI 原生 API，常用 Base URL 为 https://api.openai.com/v1。',
      openai: '原生 OpenAI API；无需兼容层。',
      anthropic: '官方未见 Anthropic 兼容接口。',
    },
    notes: ['GPT-5.5 价格和上下文较高，预算敏感场景要先看 pricing 和 rate limits。'],
  },
  {
    key: 'google',
    name: 'Google Gemini / AI Studio',
    url: 'https://aistudio.google.com/',
    topModel: 'Gemini 3.5 / Gemini 3.5 Flash',
    description: '适合快速申请 Gemini API Key、体验多模态、长上下文和 agentic/coding 任务。',
    evidenceDate,
    links: {
      developer: 'https://ai.google.dev/',
      console: 'https://aistudio.google.com/',
      docs: 'https://ai.google.dev/gemini-api/docs/models',
      models: 'https://ai.google.dev/gemini-api/docs/models',
      pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
      openaiCompatible: 'https://ai.google.dev/gemini-api/docs/openai',
    },
    compatibility: {
      native: 'Gemini Developer API 原生接口。',
      openai: '官方提供 OpenAI compatibility，Base URL 为 https://generativelanguage.googleapis.com/v1beta/openai/。',
      anthropic: '官方未见 Anthropic 兼容接口。',
    },
    notes: ['Gemini 模型版本有 stable/preview/latest/experimental 差异，生产配置要写精确 model id。'],
  },
  {
    key: 'grok',
    name: 'xAI / Grok',
    url: 'https://console.x.ai/',
    topModel: 'Grok 4.3',
    description: 'xAI 官方模型页建议除音频、图像、视频专用 API 外，其它用途使用 Grok 4.3。',
    evidenceDate,
    links: {
      developer: 'https://docs.x.ai/overview',
      console: 'https://console.x.ai/',
      docs: 'https://docs.x.ai/developers/models',
      models: 'https://docs.x.ai/developers/models',
      pricing: 'https://docs.x.ai/developers/pricing',
      openaiCompatible: 'https://docs.x.ai/developers/rest-api-reference',
    },
    compatibility: {
      native: 'xAI 原生 SDK / REST API。',
      openai: '官方 REST API 参考说明兼容 OpenAI 风格调用，Base URL 为 https://api.x.ai/v1。',
      anthropic: '官方未见 Anthropic 兼容接口。',
    },
    notes: ['图像、视频、语音有专用模型和 API；聊天/代码类优先看 Grok 4.3 与 Grok Build。'],
  },
  {
    key: 'claude',
    name: 'Anthropic Claude',
    url: 'https://platform.claude.com/',
    topModel: 'Claude Fable 5 / claude-fable-5',
    description: 'Anthropic 官方模型页列出 Claude Fable 5，并称其面向最难推理和长期 agentic work；实际可用性以控制台和官方状态为准。',
    evidenceDate,
    links: {
      developer: 'https://platform.claude.com/',
      console: 'https://console.anthropic.com/',
      docs: 'https://platform.claude.com/docs/en/about-claude/models/overview',
      models: 'https://platform.claude.com/docs/en/api/models/list',
      pricing: 'https://platform.claude.com/docs/en/about-claude/pricing',
      openaiCompatible: 'https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk',
      anthropicCompatible: 'https://docs.anthropic.com/en/api/overview',
    },
    compatibility: {
      native: 'Claude 原生 Anthropic Messages API，常用 Base URL 为 https://api.anthropic.com。',
      openai: '官方提供 OpenAI SDK compatibility，但说明主要用于测试/比较，生产更推荐原生 Claude API。',
      anthropic: '原生 Anthropic API；不是兼容层。',
    },
    notes: ['Claude Fable 5 官方可证实；但 Anthropic release notes 曾提示 2026-06-12 暂停 Fable/Mythos 访问，因此新手要以控制台和状态页实际可用性为准。'],
  },
  {
    key: 'minimax',
    name: 'MiniMax',
    url: 'https://platform.minimax.io/',
    topModel: 'MiniMax-M3',
    description: 'MiniMax-M3 是官方当前 M 系列主推模型，1M 上下文，面向 Agent、代码、工具调用和长上下文任务。',
    evidenceDate,
    links: {
      developer: 'https://platform.minimax.io/',
      docs: 'https://platform.minimax.io/docs/api-reference/api-overview',
      models: 'https://platform.minimax.io/docs/guides/models-intro',
      pricing: 'https://platform.minimax.io/docs/guides/pricing-paygo',
      tokenPlan: 'https://platform.minimax.io/docs/guides/pricing-token-plan',
      openaiCompatible: 'https://platform.minimax.io/docs/api-reference/text-openai-api',
      anthropicCompatible: 'https://platform.minimax.io/docs/api-reference/text-anthropic-api',
      unifiedApi: 'https://platform.minimax.io/docs/guides/text-generation',
    },
    compatibility: {
      native: 'MiniMax Open Platform 原生能力覆盖文本、语音、视频、图像、音乐等。',
      openai: '官方 OpenAI SDK 文档支持 MiniMax-M3 等模型，Base URL 为 https://api.minimax.io/v1。',
      anthropic: '官方 Anthropic SDK 文档支持 Anthropic-compatible endpoint，Base URL 为 https://api.minimax.io/anthropic。',
    },
    notes: ['MiniMax 同时有 Pay-As-You-Go 和 Token Plan；使用哪种计费取决于 API Key 类型。'],
  },
];