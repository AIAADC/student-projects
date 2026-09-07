import type { AgentModel } from "./types.js";

export interface AgentModelsResponse {
  ok: boolean;
  command: "agent-models";
  defaultModel: string;
  models: AgentModel[];
}

export async function fetchAgentModels(): Promise<AgentModelsResponse> {
  const res = await fetch("/api/agent/models");
  if (!res.ok) throw new Error("GET /api/agent/models → " + res.status);
  return (await res.json()) as AgentModelsResponse;
}
