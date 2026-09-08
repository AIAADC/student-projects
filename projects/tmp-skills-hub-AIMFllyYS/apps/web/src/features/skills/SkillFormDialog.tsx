import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface SkillFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  error: string | null;
  enableAll: boolean;
  onEnableAllChange: (checked: boolean) => void;
  enableTestId: string;
  submitTestId: string;
  submitDisabled: boolean;
  idleSubmitLabel: string;
  busySubmitLabel: string;
  onSubmit: () => void;
  children: React.ReactNode;
}

/** 收录/新建共用的受控对话框壳:启用到全部应用勾选 + 错误 + 提交。 */
export function SkillFormDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  error,
  enableAll,
  onEnableAllChange,
  enableTestId,
  submitTestId,
  submitDisabled,
  idleSubmitLabel,
  busySubmitLabel,
  onSubmit,
  children,
}: SkillFormDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {children}
          <label className="flex items-center gap-2 text-xs text-ink-mid">
            <Checkbox
              data-testid={enableTestId}
              checked={enableAll}
              onCheckedChange={onEnableAllChange}
            />
            同时启用到全部已发现应用
          </label>
          {error !== null && <p className="text-xs text-red-700">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" data-testid={submitTestId} disabled={busy || submitDisabled}>
              {busy ? busySubmitLabel : idleSubmitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
