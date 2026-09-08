import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return (
    <span className={cn("inline-flex rounded-full bg-surface px-2 py-0.5 text-xs text-ink-mid", className)} {...props} />
  );
}
