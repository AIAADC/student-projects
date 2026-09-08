import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  checked,
  onCheckedChange,
  disabled,
  ...props
}: {
  className?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
} & Omit<React.ComponentProps<typeof SwitchPrimitive.Root>, "checked" | "onCheckedChange" | "className">): React.JSX.Element {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={(next) => onCheckedChange?.(next)}
      disabled={disabled}
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line bg-surface outline-none transition-colors duration-normal ease-spring data-checked:border-ink-strong data-checked:bg-ink-strong disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white transition-transform duration-normal ease-spring motion-reduce:transition-none group-data-checked:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
