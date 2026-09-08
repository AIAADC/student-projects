import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Dialog({
  open,
  onOpenChange,
  children,
  disablePointerDismissal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  disablePointerDismissal?: boolean;
}): React.JSX.Element {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      {...(disablePointerDismissal === true ? { disablePointerDismissal: true } : {})}
    >
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({
  className,
  children,
  nested = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Popup> & { nested?: boolean }): React.JSX.Element {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "dialog-backdrop fixed inset-0 bg-ink-strong/40",
          nested ? "z-[60]" : "z-50",
        )}
      />
      <DialogPrimitive.Popup
        className={cn(
          "dialog-popup fixed top-1/2 left-1/2 w-full max-w-md rounded-lg border border-line bg-white p-4 outline-none",
          nested ? "z-[61]" : "z-50",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>): React.JSX.Element {
  return <DialogPrimitive.Title className={cn("text-base font-medium text-ink-strong", className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>): React.JSX.Element {
  return <DialogPrimitive.Description className={cn("mt-2 text-sm text-ink-mid", className)} {...props} />;
}

export const DialogClose = DialogPrimitive.Close;
