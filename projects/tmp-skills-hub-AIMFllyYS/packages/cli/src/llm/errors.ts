/**
 * 把 AI SDK / 网络异常收成 ai-integration-v1 的失败分类。
 * 返回的 message 绝不含密钥。
 */

import { APICallError } from "ai";

export type LlmFailureCode = "not-configured" | "timeout" | "network" | "api";

const ERROR_HINTS: Record<number, string> = {
  400: "请求格式错误(按提示修正请求体)",
  401: "认证失败(检查 QINIU_API_KEY)",
  402: "账户余额不足",
  422: "请求参数无效",
  429: "请求过于频繁(限流),请稍后重试",
  500: "七牛云服务端错误,请稍后重试",
  503: "七牛云服务过载,请稍后重试",
};

function scrub(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
}

export function mapLlmError(e: unknown): { code: LlmFailureCode; message: string } {
  if (APICallError.isInstance(e)) {
    const status = e.statusCode;
    if (status === 401) {
      return { code: "api", message: "AI 调用失败: " + ERROR_HINTS[401] };
    }
    const hint = status !== undefined ? ERROR_HINTS[status] : undefined;
    return { code: "api", message: "AI 调用失败: " + (hint ?? "七牛云返回 HTTP " + String(status ?? "未知")) };
  }
  if (e instanceof Error) {
    const name = e.name;
    const msg = e.message.toLowerCase();
    if (name === "AbortError" || name === "TimeoutError" || msg.includes("timeout") || msg.includes("timed out")) {
      return { code: "timeout", message: "AI 调用超时,请稍后重试" };
    }
    if (name === "AbortError" || msg.includes("aborted")) {
      return { code: "network", message: "请求已中止" };
    }
    return { code: "network", message: "无法连接 AI 服务: " + scrub(e.message) };
  }
  return { code: "network", message: "无法连接 AI 服务" };
}
