import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAction } from "../actions/registry.js";
import { formatBatchResult } from "./batch-links.js";
import { SkillFormDialog } from "./SkillFormDialog.js";
import type { AdoptResponse } from "./types.js";

interface AdoptFormProps {
  clientIds?: string[];
  onDone: () => void;
  onNotice?: (text: string) => void;
}

/** 收录入口:对话框一次填完,不浏览目录。 */
export function AdoptForm({ clientIds = [], onDone, onNotice }: AdoptFormProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [enableAll, setEnableAll] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const adopt = getAction("adopt");

  const submit = async (): Promise<void> => {
    const trimmed = source.trim();
    if (trimmed === "") return;
    setBusy(true);
    setError(null);
    try {
      const report: AdoptResponse = await adopt.execute({ source: trimmed });
      const hashes = report.outcomes
        .map((o) => o.hash ?? o.existingHash)
        .filter((h): h is string => typeof h === "string" && h !== "");
      let extra = "";
      if (enableAll && hashes.length > 0 && clientIds.length > 0) {
        const linked = await getAction("apply-clean-links").execute({
          hashes,
          clientIds,
          action: "enable",
        });
        extra = "。 " + formatBatchResult("enable", linked.created.length, linked.removed.length, linked.skipped);
      }
      onNotice?.(
        "新增 " + String(report.adopted) + " / 重复 " + String(report.duplicates) +
          " / 冲突 " + String(report.conflicts) + " / 未达标 " + String(report.invalid) + extra,
      );
      if (report.adopted > 0 || report.duplicates > 0) onDone();
      setSource("");
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" data-testid="adopt-open" onClick={() => setOpen(true)}>
        {adopt.verb}
      </Button>
      <SkillFormDialog
        open={open}
        onOpenChange={setOpen}
        title={adopt.verb}
        description="粘贴本地路径、GitHub 或 skills.sh 链接。"
        busy={busy}
        error={error}
        enableAll={enableAll}
        onEnableAllChange={setEnableAll}
        enableTestId="adopt-enable-all"
        submitTestId="adopt-submit"
        submitDisabled={source.trim() === ""}
        idleSubmitLabel={adopt.verb}
        busySubmitLabel="收录中…"
        onSubmit={() => void submit()}
      >
        <Input
          data-testid="adopt-source"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="本地路径 / GitHub / skills.sh 链接"
        />
      </SkillFormDialog>
    </>
  );
}
