/**
 * 面板 Agent:ToolLoopAgent + 一等工具 + 写策略(agent-v0.md)。
 */

import { stepCountIs, ToolLoopAgent, type LanguageModel } from "ai";
import { buildAgentSystemPrompt } from "./prompt.js";
import { createAgentTools, WRITE_TOOL_NAMES, type ToolEnv } from "./tools.js";

export type WritePolicy = "ask" | "allow";

export function parseWritePolicy(value: unknown): WritePolicy {
  return value === "allow" ? "allow" : "ask";
}

export interface CreateSkillsHubAgentOptions {
  model: LanguageModel;
  env: ToolEnv;
  clients: string[];
  writePolicy: WritePolicy;
}

export function createSkillsHubAgent(opts: CreateSkillsHubAgentOptions) {
  const tools = createAgentTools(opts.env);
  return new ToolLoopAgent({
    id: "skills-hub",
    model: opts.model,
    instructions: buildAgentSystemPrompt({
      storeRoot: opts.env.storeRoot ?? "(未配置)",
      clients: opts.clients,
      writePolicy: opts.writePolicy,
    }),
    tools,
    stopWhen: stepCountIs(15),
    toolApproval: ({ toolCall }) => {
      if (opts.writePolicy === "allow") return "approved";
      return WRITE_TOOL_NAMES.has(String(toolCall.toolName)) ? "user-approval" : "not-applicable";
    },
  });
}
