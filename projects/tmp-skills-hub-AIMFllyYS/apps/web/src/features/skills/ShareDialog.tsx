import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getAction } from "../actions/registry.js";
import type { ShareResponse } from "./types.js";

export function ShareDialog({
  open,
  target,
  onOpenChange,
}: {
  open: boolean;
  target: string;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ShareResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const share = getAction("share");

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await share.execute({ target }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{share.verb}</DialogTitle>
        <DialogDescription>成功后给出可 adopt 的链接。</DialogDescription>
        <Button type="button" className="mt-3" data-testid="share-run" disabled={busy} onClick={() => void run()}>
          {busy ? "分享中…" : share.verb}
        </Button>
        {error !== null && <p data-testid="share-error" className="mt-2 text-xs text-red-700">{error}</p>}
        {result !== null && (
          <p data-testid="share-url" className="mt-2 break-all text-xs text-ink-mid">
            {result.idempotent ? "已存在: " : ""}
            {result.url}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
