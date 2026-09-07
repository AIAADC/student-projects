import * as fs from 'fs';
import * as path from 'path';

export interface AiSettings {
  baseUrl: string;
  apiKey: string;
  modelIds: string[];
  activeModelId: string;
}

export function parseModelIds(value?: string): string[] {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return '空';
  if (trimmed.length <= 6) return '*'.repeat(trimmed.length);
  const visible = Math.min(4, Math.floor(trimmed.length / 4));
  return `${trimmed.slice(0, visible)}${'*'.repeat(Math.max(trimmed.length - visible * 2, 4))}${trimmed.slice(-visible)}`;
}

export function parseAiEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): AiSettings {
  const modelIds = parseModelIds(env.AI_MODELS || env.AI_MODEL || '');
  const activeModelId = (env.AI_MODEL || modelIds[0] || '').trim();
  return {
    baseUrl: (env.AI_BASE_URL || '').trim(),
    apiKey: (env.AI_API_KEY || '').trim(),
    modelIds,
    activeModelId,
  };
}

export function resolveEnvPath(): string {
  return path.join(__dirname, '..', '..', '.env');
}

function parseEnvLines(content: string): { key: string; raw: string }[] {
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=.*$/);
    return { key: match ? match[1] : '', raw: line };
  });
}

export function writeAiSettings(envPath: string, settings: AiSettings): void {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const updates: Record<string, string> = {
    AI_BASE_URL: settings.baseUrl,
    AI_API_KEY: settings.apiKey,
    AI_MODELS: settings.modelIds.join(','),
    AI_MODEL: settings.activeModelId || settings.modelIds[0] || '',
  };
  const seen = new Set<string>();
  const next = parseEnvLines(existing).map((line) => {
    if (!line.key || !(line.key in updates)) return line.raw;
    seen.add(line.key);
    return `${line.key}=${updates[line.key]}`;
  });

  Object.keys(updates).forEach((key) => {
    if (!seen.has(key)) next.push(`${key}=${updates[key]}`);
  });

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, next.join('\n').replace(/\n*$/, '\n'), 'utf8');
}

export function getConfiguredModelIds(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string[] {
  return parseAiEnv(env).modelIds;
}

export function getActiveModelId(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  return parseAiEnv(env).activeModelId;
}

export function updateActiveModelId(envPath: string, settings: AiSettings, modelId: string): AiSettings {
  const next = { ...settings, activeModelId: modelId };
  writeAiSettings(envPath, next);
  return next;
}
