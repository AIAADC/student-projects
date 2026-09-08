/**
 * 七牛云 OpenAI 兼容 provider(ai-integration-v1.md)。
 * 密钥只从环境变量读;enable_thinking 经 transformRequestBody 注入 false。
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export const DEFAULT_QINIU_BASE_URL = "https://api.qnaigc.com/v1";
export const DEFAULT_MODEL = "deepseek/deepseek-v4-flash-20260731";
export const STREAM_IDLE_TIMEOUT_MS = 60_000;

export function qiniuApiKey(): string | undefined {
  const key = process.env.QINIU_API_KEY;
  return key === undefined || key === "" ? undefined : key;
}

export function llmBaseUrl(): string {
  return (process.env.QINIU_BASE_URL ?? DEFAULT_QINIU_BASE_URL).replace(/\/$/, "");
}

/** 缺省模型:explicit > QINIU_MODEL > DEFAULT_MODEL。 */
export function resolveModel(explicit?: string): string {
  if (explicit !== undefined && explicit !== "") return explicit;
  const env = process.env.QINIU_MODEL;
  return env !== undefined && env !== "" ? env : DEFAULT_MODEL;
}

export function notConfiguredMessage(): string {
  return "未配置 QINIU_API_KEY:请在 .env 中填写后重试(功能不可用但不崩溃)。";
}

/** 给请求体补 enable_thinking:false(七牛思考开关)。导出供单测。 */
export function injectThinkingOff(body: Record<string, unknown>): Record<string, unknown> {
  return { ...body, enable_thinking: false };
}

export interface QiniuModelOptions {
  fetch?: typeof fetch;
}

/**
 * 已配置密钥时才能调用。调用方先查 qiniuApiKey()。
 */
export function createQiniuModel(modelId: string, opts: QiniuModelOptions = {}): LanguageModel {
  const apiKey = qiniuApiKey();
  if (apiKey === undefined) {
    throw new Error(notConfiguredMessage());
  }
  const settings: Parameters<typeof createOpenAICompatible>[0] = {
    name: "qiniu",
    baseURL: llmBaseUrl(),
    apiKey,
    transformRequestBody: (body) => injectThinkingOff(body as Record<string, unknown>),
  };
  if (opts.fetch !== undefined) settings.fetch = opts.fetch;
  return createOpenAICompatible(settings).chatModel(modelId);
}
