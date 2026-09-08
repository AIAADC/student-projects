import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink-strong outline-none motion-fill placeholder:text-ink-faint focus:border-line-strong focus-visible:ring-1 focus-visible:ring-line-strong disabled:opacity-50";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function NativeSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={cn(fieldClass, className)} {...props} />;
}
