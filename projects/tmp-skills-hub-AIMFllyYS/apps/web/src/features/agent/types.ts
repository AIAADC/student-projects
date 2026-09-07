/** Agent 前端类型(模型白名单 + 写策略)。消息形状走 AI SDK UIMessage。 */

export interface AgentModel {
  id: string;
  label: string;
  note: string;
}

export type WritePolicy = "ask" | "allow";
