import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Collapsible({
  defaultOpen = false,
  open,
  onOpenChange,
  children,
  className,
}: {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <CollapsiblePrimitive.Root
      defaultOpen={defaultOpen}
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
      className={className}
    >
      {children}
    </CollapsiblePrimitive.Root>
  );
}

export function CollapsibleTrigger({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Trigger>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.Trigger
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left text-sm text-ink-strong outline-none motion-fill hover:bg-surface focus-visible:ring-1 focus-visible:ring-line-strong",
        className,
      )}
      {...props}
    />
  );
}

export function CollapsiblePanel({
  className,
  ...props
}: ComponentProps<typeof CollapsiblePrimitive.Panel>): React.JSX.Element {
  return (
    <CollapsiblePrimitive.Panel className={cn("collapsible-panel flex flex-col", className)} {...props} />
  );
}
