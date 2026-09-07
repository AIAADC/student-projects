import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>): React.JSX.Element {
  return <label className={cn("text-sm font-medium text-ink-strong", className)} {...props} />;
}
