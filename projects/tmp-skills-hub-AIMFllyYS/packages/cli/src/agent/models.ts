/**
 * Agent 模型白名单(agent-v0.md §6)。ID 以七牛云 /v1/models 实际返回为准
 * (2026-08-22 核实);不在白名单的 model 参数一律回落默认模型。
 */

export interface AgentModel {
  id: string;
  label: string;
  note: string;
}

export const DEFAULT_AGENT_MODEL = "deepseek/deepseek-v4-flash-20260731";

export const AGENT_MODELS: AgentModel[] = [
  { id: DEFAULT_AGENT_MODEL, label: "DeepSeek V4 Flash", note: "默认 · 快速便宜" },
  { id: "deepseek/deepseek-v4-pro-0813", label: "DeepSeek V4 Pro", note: "能力最强 · 复杂任务" },
  { id: "z-ai/glm-5.3", label: "GLM-5.3", note: "编程/长程任务" },
  { id: "minimax/minimax-m3", label: "MiniMax M3", note: "最便宜 · 长上下文" },
];

/** 白名单校验:不在名单(或非字符串)回落默认模型。 */
export function resolveAgentModel(id: unknown): string {
  return typeof id === "string" && AGENT_MODELS.some((m) => m.id === id) ? id : DEFAULT_AGENT_MODEL;
}
