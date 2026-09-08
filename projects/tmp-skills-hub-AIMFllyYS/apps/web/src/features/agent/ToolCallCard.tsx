/**
 * 工具调用卡片:运行中 / 待批准 / 成功 / 失败 / 已拒绝。
 */

import { Loader2, Wrench } from "lucide-react";
import { isToolUIPart, type UIMessage } from "ai";
import { Button } from "@/components/ui/button";

const ARGS_PREVIEW_LIMIT = 120;

function preview(value: unknown): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return raw.length > ARGS_PREVIEW_LIMIT ? raw.slice(0, ARGS_PREVIEW_LIMIT) + "…" : raw;
}

function toolNameOf(type: string): string {
  return type.startsWith("tool-") ? type.slice(5) : type;
}

export function ToolCallCard({
  part,
  onApprove,
  onDeny,
}: {
  part: UIMessage["parts"][number];
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
}): React.JSX.Element | null {
  if (!isToolUIPart(part)) return null;
  const name = toolNameOf(part.type);
  const waiting = part.state === "approval-requested" && part.approval.isAutomatic !== true;
  return (
    <div className="motion-row rounded-xl border border-line px-3 py-2 text-sm">
      <div className="flex min-w-0 items-center gap-2">
        <Wrench className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
        <span className="shrink-0 font-mono text-xs text-ink-strong">{name}</span>
        <span className="min-w-0 truncate font-mono text-xs text-ink-faint">{preview(part.input)}</span>
        <span className="ml-auto shrink-0">
          {(part.state === "input-streaming" || part.state === "input-available") && (
            <span className="flex items-center gap-1 text-xs text-ink-mid">
              <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden />
              运行中
            </span>
          )}
          {waiting && <span className="text-xs text-ink-mid">待批准</span>}
          {part.state === "output-available" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden />
              完成
            </span>
          )}
          {part.state === "output-error" && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
              失败
            </span>
          )}
          {part.state === "output-denied" && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
              已拒绝
            </span>
          )}
        </span>
      </div>
      {waiting && (
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" onClick={() => onApprove?.(part.approval.id)}>
            批准
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onDeny?.(part.approval.id)}>
            拒绝
          </Button>
        </div>
      )}
      {part.state === "output-available" && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-ink-faint">输出</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-2 text-xs text-ink-mid">
            {typeof part.output === "string" ? part.output : JSON.stringify(part.output, null, 2)}
          </pre>
        </details>
      )}
      {part.state === "output-error" && <p className="mt-1 text-xs text-red-700">{part.errorText}</p>}
    </div>
  );
}
