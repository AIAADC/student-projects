/**
 * Agent 页:页头模型 + 写策略 + 消息区流式渲染 + 输入区。
 */

import { useEffect, useRef, useState } from "react";
import { isToolUIPart, type UIMessage } from "ai";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { renderMarkdown } from "@/lib/markdown.js";
import { fetchAgentModels } from "./api.js";
import { ToolCallCard } from "./ToolCallCard.js";
import type { AgentModel, WritePolicy } from "./types.js";
import { useAgentChat } from "./useAgentChat.js";

const SUGGESTIONS = ["扫描一下我本机有哪些 skill", "列出库存,告诉我哪些还没启用", "帮我分析库存里哪些 skill 可能冲突"];

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

export function AgentPage(): React.JSX.Element {
  const {
    messages,
    busy,
    errorText,
    model,
    setModel,
    writePolicy,
    setWritePolicy,
    applyModelDefault,
    send,
    stop,
    reset,
    approve,
    deny,
  } = useAgentChat();
  const [models, setModels] = useState<AgentModel[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAgentModels()
      .then((res) => {
        if (cancelled) return;
        setModels(res.models);
        applyModelDefault(
          res.defaultModel,
          res.models.map((m) => m.id),
        );
      })
      .catch((e) => {
        if (!cancelled) toast.error("模型列表加载失败: " + (e instanceof Error ? e.message : String(e)));
      });
    return () => {
      cancelled = true;
    };
  }, [applyModelDefault]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [messages, errorText]);

  const submit = (): void => {
    if (input.trim() === "" || busy) return;
    send(input);
    setInput("");
  };

  const onPolicyChange = (next: WritePolicy): void => {
    setWritePolicy(next);
    if (next === "allow") toast.message("写操作将不再逐条确认");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-ink-strong">
            <Bot className="size-4 text-ink-mid" aria-hidden />
            Agent
          </h1>
          <p className="mt-0.5 text-sm text-ink-mid">通过对话管理你的 skill 库存</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            aria-label="写策略"
            value={writePolicy}
            onChange={(ev) => onPolicyChange(ev.target.value === "allow" ? "allow" : "ask")}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink-strong focus:outline-none"
          >
            <option value="ask">写操作需批准</option>
            <option value="allow">全部允许</option>
          </select>
          <select
            aria-label="模型"
            value={model}
            onChange={(ev) => setModel(ev.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink-strong focus:outline-none"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.note}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={reset}>
            新会话
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
        {messages.length === 0 && errorText === null && (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <p className="text-sm text-ink-faint">问我任何关于你的 skill 库存的事,我可以直接帮你查、启用、停用、归档。</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} type="button" variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.role === "user" ? (
              <div className="ml-auto max-w-[80%] whitespace-pre-wrap rounded-xl bg-surface px-4 py-2 text-sm text-ink-strong">
                {textOf(message)}
              </div>
            ) : (
              message.parts.map((part, i) =>
                part.type === "text" ? (
                  <div
                    key={message.id + "-t-" + String(i)}
                    className="skill-md max-w-full text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }}
                  />
                ) : isToolUIPart(part) ? (
                  <ToolCallCard key={part.toolCallId} part={part} onApprove={approve} onDeny={deny} />
                ) : null,
              )
            )}
          </div>
        ))}
        {errorText !== null && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p>}
      </div>

      <div className="shrink-0 border-t border-line p-4">
        <div className="flex items-end gap-2">
          <Textarea
            data-testid="agent-input"
            rows={2}
            value={input}
            placeholder="输入消息,Enter 发送,Shift+Enter 换行"
            onChange={(ev) => setInput(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === "Enter" && !ev.shiftKey) {
                ev.preventDefault();
                submit();
              }
            }}
            className="min-h-0 flex-1 resize-none"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={stop}>
              停止
            </Button>
          ) : (
            <Button type="button" data-testid="agent-send" disabled={input.trim() === ""} onClick={submit}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
