import { PreviewCard } from "@base-ui/react/preview-card";
import { cn } from "@/lib/utils";

/** 收起导航、截断路径用的短提示。系统减少动效时仍可出现（无位移）。 */
export function Tooltip({
  label,
  children,
  disabled = false,
  side = "right",
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
  side?: "top" | "bottom" | "left" | "right";
}): React.JSX.Element {
  return (
    <PreviewCard.Root>
      <PreviewCard.Trigger
        delay={200}
        closeDelay={80}
        render={<span className="contents" />}
      >
        {children}
      </PreviewCard.Trigger>
      {!disabled && (
        <PreviewCard.Portal>
          <PreviewCard.Positioner side={side} sideOffset={8} className="z-50">
            <PreviewCard.Popup className="max-w-xs rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink-strong transition-opacity duration-fast ease-smooth data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none">
              {label}
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      )}
    </PreviewCard.Root>
  );
}

export function TruncateTip({
  text,
  className,
  side = "top",
}: {
  text: string;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}): React.JSX.Element {
  return (
    <Tooltip label={text} side={side}>
      <span className={cn("block min-w-0 max-w-full truncate", className)}>{text}</span>
    </Tooltip>
  );
}
