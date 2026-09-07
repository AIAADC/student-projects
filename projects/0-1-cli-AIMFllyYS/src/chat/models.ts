import { ModelInfo } from '../types';
import { parseAiEnv } from './config';

const BUILTIN_MODEL_DEFAULTS = {
  source: 'builtin' as const,
  supportsTools: true,
  openAiCompatible: true,
  modalities: ['text'],
};

export const MODELS: ModelInfo[] = [
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    description: '快速通用对话',
    contextLength: 128000,
    ...BUILTIN_MODEL_DEFAULTS,
  },
  {
    id: 'deepseek-v4-pro',
    name: 'DeepSeek V4 Pro',
    provider: 'deepseek',
    description: '旗舰推理模型',
    contextLength: 128000,
    ...BUILTIN_MODEL_DEFAULTS,
  },
  {
    id: 'glm-4.7-flash',
    name: 'GLM-4.7 Flash',
    provider: 'zhipu',
    description: '免费 · 轻量高性能',
    supportsSearch: true,
    contextLength: 128000,
    ...BUILTIN_MODEL_DEFAULTS,
  },
  {
    id: 'glm-4.5-flash',
    name: 'GLM-4.5 Flash',
    provider: 'zhipu',
    description: '免费 · 强推理',
    supportsSearch: true,
    contextLength: 128000,
    ...BUILTIN_MODEL_DEFAULTS,
  },
  {
    id: 'glm-5',
    name: 'GLM-5',
    provider: 'zhipu',
    description: '旗舰 · 编程+规划',
    supportsSearch: true,
    contextLength: 200000,
    ...BUILTIN_MODEL_DEFAULTS,
  },
];

export const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

function createCustomModelInfo(id: string): ModelInfo {
  return {
    id,
    name: id,
    provider: 'custom',
    description: 'Custom configured model',
    source: 'custom',
    supportsTools: true,
    openAiCompatible: true,
    modalities: ['text'],
  };
}

export function resolveModelInfo(
  id: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): ModelInfo {
  const builtin = MODELS.find((model) => model.id === id);
  if (builtin) return { ...builtin, source: 'builtin' };
  return createCustomModelInfo(id);
}

export function getSelectableModels(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): ModelInfo[] {
  const settings = parseAiEnv(env);
  if (settings.modelIds.length === 0) {
    return MODELS.map((model) => ({ ...model, source: 'builtin' as const }));
  }
  return settings.modelIds.map((id) => resolveModelInfo(id, env));
}

export function getAvailableModels(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): ModelInfo[] {
  const settings = parseAiEnv(env);
  const configured = settings.modelIds
    .filter((id) => !MODELS.some((model) => model.id === id))
    .map((id) => createCustomModelInfo(id));

  return [...MODELS.map((model) => ({ ...model, source: 'builtin' as const })), ...configured];
}

export function getModelById(
  id: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): ModelInfo | undefined {
  const selectable = getSelectableModels(env);
  const selected = selectable.find((model) => model.id === id);
  if (selected) return selected;
  return getAvailableModels(env).find((model) => model.id === id);
}

export function isConfiguredModelId(
  id: string,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const settings = parseAiEnv(env);
  if (settings.modelIds.length === 0) return MODELS.some((model) => model.id === id);
  return settings.modelIds.includes(id);
}
