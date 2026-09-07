import { useCallback, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { stepTabIndex } from "./tabs-step.js";

export { stepTabIndex } from "./tabs-step.js";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  testId?: string;
}

/** 分段胶囊控制器：浅灰底槽 + 白底选中块，弹簧过渡。 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  size = "default",
  disabled = false,
}: {
  value: T;
  onChange: (id: T) => void;
  items: readonly SegmentedTabItem<T>[];
  ariaLabel: string;
  size?: "default" | "sm";
  disabled?: boolean;
}): React.JSX.Element {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    const item = items[stepTabIndex(items.findIndex((it) => it.id === value), e.key, items.length)];
    if (item === undefined) return;
    e.preventDefault();
    onChange(item.id);
    const i = items.findIndex((it) => it.id === item.id);
    if (i >= 0) buttons.current[i]?.focus();
  }, [disabled, items, onChange, value]);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className="inline-flex rounded-lg bg-surface p-1"
    >
      {items.map((item, i) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={disabled}
            data-testid={item.testId}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center rounded-md outline-none motion-press",
              "focus-visible:ring-1 focus-visible:ring-line-strong",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active
                ? "bg-white font-medium text-ink-strong shadow-[var(--shadow-thumb)]"
                : "text-ink-mid hover:text-ink-strong",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
