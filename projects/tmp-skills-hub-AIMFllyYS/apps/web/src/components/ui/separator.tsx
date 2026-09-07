import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div role="separator" className={cn("h-px w-full bg-line", className)} {...props} />;
}
