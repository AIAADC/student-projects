import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getAction } from "../actions/registry.js";
import type { AnalyzeReportItem, AnalyzeResponse } from "./types.js";

function ItemList({ title, items, empty }: { title: string; items: AnalyzeReportItem[]; empty: string }): React.JSX.Element {
  return (
    <section className="mt-4">
      <h3 className="text-xs font-medium text-ink-strong">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-ink-mid">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {items.map((item) => (
            <li key={item.name + item.reason} className="text-sm text-ink-mid">
              <span className="font-medium text-ink-strong">{item.name}</span>
              <span className="text-ink-faint"> — </span>
              {item.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AnalyzeDialog({
  open,
  target,
  onOpenChange,
}: {
  open: boolean;
  target: string;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const analyze = getAction("analyze");

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await analyze.execute({ target }));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "analyze-failed";
      setError({ code, message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogTitle>{analyze.verb}</DialogTitle>
        <DialogDescription>报告仅为建议,未做任何写操作。</DialogDescription>
        <Button type="button" className="mt-3" data-testid="analyze-run" disabled={busy} onClick={() => void run()}>
          {busy ? "分析中…" : analyze.verb}
        </Button>
        {error !== null && (
          <p data-testid="analyze-degraded" className="mt-3 text-sm text-ink-mid">{error.message}</p>
        )}
        {error === null && report !== null && (
          <div data-testid="analyze-report">
            <ItemList title="相近" items={report.similar} empty="未发现相近 skill" />
            <ItemList title="可能冲突" items={report.conflict} empty="未发现冲突" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
