/**
 * SSE 消费工具(翻译与 Agent 共用):POST + 手写 ReadableStream 解析,
 * 不引第三方库。帧格式:event: <name>\ndata: <JSON>\n\n(翻译专用 delta/done/error)。
 */

export interface SseHandlers {
  [event: string]: (data: string) => void;
}

/**
 * POST JSON 并消费 SSE 响应。非 2xx 抛 Error(读 JSON 信封 message);
 * 主动 abort 时静默返回(调用方自己决定 UI 反馈);流读完正常返回。
 */
export async function postSse(url: string, body: unknown, handlers: SseHandlers, signal?: AbortSignal): Promise<void> {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
  if (signal !== undefined) init.signal = signal;
  const res = await fetch(url, init);
  if (!res.ok) {
    const fail = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(fail?.message ?? "HTTP " + String(res.status));
  }
  const streamBody = res.body;
  if (streamBody === null) return;
  const reader = streamBody.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) dispatchFrame(frame, handlers);
    }
    if (buffer.trim() !== "") dispatchFrame(buffer, handlers);
  } catch (e) {
    if (signal?.aborted === true) return; // 主动停止:静默
    throw e;
  }
}

/** 单帧解析:event 行定事件名,data 行(可多行)拼负载。 */
function dispatchFrame(frame: string, handlers: SseHandlers): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return;
  handlers[event]?.(dataLines.join("\n"));
}
