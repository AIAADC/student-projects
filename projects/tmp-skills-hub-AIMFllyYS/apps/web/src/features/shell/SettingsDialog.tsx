import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TruncateTip } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getAction } from "../actions/registry.js";
import { formatResetPreview } from "../skills/catalog.js";
import type { ClientInfo } from "../skills/types.js";
import { groupClientIds } from "./apps-layout.js";

const RESET_FALLBACK_BODY =
  "将按最近一份备份还原各应用里的 skills,并旁路旧库存后再收录。此操作不能用撤销按钮收回。";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeRoot: string;
  clients: ClientInfo[];
  latestSnapshotId: string | null;
  onResetDone: () => void;
}

/** 左下角设置覆盖层：只读路径、折叠应用名单、重置确认。 */
export function SettingsDialog({
  open,
  onOpenChange,
  storeRoot,
  clients,
  latestSnapshotId,
  onResetDone,
}: SettingsDialogProps): React.JSX.Element {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewBody, setPreviewBody] = useState(RESET_FALLBACK_BODY);
  const groups = groupClientIds(clients.map((c) => c.clientId));
  const path = storeRoot === "" ? "未配置" : storeRoot;
  const reset = getAction("reset");

  const copyPath = (): void => {
    if (storeRoot === "") return;
    void navigator.clipboard.writeText(storeRoot).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      },
      () => {
        toast.error("无法复制路径");
      },
    );
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          if (!next) setAsk(false);
          onOpenChange(next);
        }}
        disablePointerDismissal={ask}
      >
        <DialogContent className="flex max-h-[min(36rem,90vh)] max-w-lg flex-col">
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>不常改、但要找得到的东西。</DialogDescription>
          <ScrollArea className="mt-4 min-h-0 flex-1">
            <section>
              <Label>库存</Label>
              <div className="mt-2 flex items-start gap-2">
                <TruncateTip text={path} className="min-w-0 flex-1 break-all font-mono text-sm text-ink-mid" />
                <Tooltip label={copied ? "已复制" : "复制路径"} side="top" disabled={storeRoot === ""}>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="复制库存路径"
                    disabled={storeRoot === ""}
                    onClick={copyPath}
                  >
                    <Copy className="size-4 text-ink-mid" aria-hidden />
                  </Button>
                </Tooltip>
              </div>
            </section>

            <section className="mt-6">
              <Label>已发现的应用</Label>
              {clients.length === 0 ? (
                <p className="mt-2 text-sm text-ink-mid">未发现应用。</p>
              ) : (
                <Collapsible defaultOpen={false} className="mt-2">
                  <CollapsibleTrigger>
                    <span>已发现 {String(clients.length)} 个应用</span>
                    <span className="text-xs text-ink-faint">展开</span>
                  </CollapsibleTrigger>
                  <CollapsiblePanel className="mt-2 space-y-3 px-1 pb-1">
                    {groups.map((g) => (
                      <div key={g.key}>
                        <p className="mb-1 text-xs text-ink-faint">{g.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {g.ids.map((id) => (
                            <Badge key={id} title={id}>
                              {id}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CollapsiblePanel>
                </Collapsible>
              )}
            </section>

            <section className="mt-6" data-testid="reset-panel">
              <Label>重置</Label>
              <p className="mt-1 text-sm text-ink-mid">
                按备份快照回到初始化前,再自动收录。请再次确认后才会执行。
              </p>
              <Button
                type="button"
                variant="destructive"
                data-testid="reset-button"
                className="mt-3"
                disabled={busy || latestSnapshotId === null}
                onClick={() => {
                  if (latestSnapshotId === null) return;
                  setBusy(true);
                  void reset.preview({ snapshotId: latestSnapshotId })
                    .then((p) => setPreviewBody(formatResetPreview(p)))
                    .catch(() => setPreviewBody(RESET_FALLBACK_BODY))
                    .finally(() => {
                      setBusy(false);
                      setAsk(true);
                    });
                }}
              >
                重置
              </Button>
              {latestSnapshotId === null && (
                <p className="mt-2 text-sm text-ink-mid">尚无备份快照,无法重置。</p>
              )}
            </section>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {ask && (
        <ConfirmDialog
          title="请再次确认"
          body={previewBody}
          confirmLabel="确认重置"
          busy={busy}
          onCancel={() => setAsk(false)}
          onConfirm={() => {
            if (latestSnapshotId === null) return;
            setBusy(true);
            void reset.execute({ snapshotId: latestSnapshotId, confirm: "reset" })
              .then((r) => {
                toast("已重置。重新收录 " + String(r.adopted) + " 份。");
                setAsk(false);
                onResetDone();
              })
              .catch((e: unknown) => {
                toast.error(e instanceof Error ? e.message : String(e));
                setAsk(false);
              })
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}
