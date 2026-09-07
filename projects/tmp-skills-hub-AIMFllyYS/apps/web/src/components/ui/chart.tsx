import type { ComponentProps, ReactElement } from "react";
import { ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { cn } from "@/lib/utils";

/** 轴/网格仍用 ink；系列色只给统计图。 */
export const CHART_INK = {
  strong: "#030712",
  mid: "#4b5563",
  faint: "#9ca3af",
  line: "#e5e7eb",
  surface: "#f9fafb",
} as const;

export const CHART_COLOR = {
  show: "#3b82f6",
  enable: "#0d9488",
  amber: "#d97706",
  purple: "#7c3aed",
} as const;

export const CHART_SERIES = [
  CHART_COLOR.show,
  CHART_COLOR.enable,
  CHART_COLOR.amber,
  CHART_COLOR.purple,
] as const;

export function ChartContainer({
  className,
  heightPx,
  children,
}: {
  className?: string;
  heightPx?: number;
  children: ReactElement;
}): React.JSX.Element {
  const height = heightPx ?? 256;
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipItem {
  name?: string;
  value?: number | string;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: ReadonlyArray<TooltipItem>;
  label?: string | number;
}): React.JSX.Element | null {
  if (active !== true || payload === undefined || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink-strong">
      {label !== undefined && label !== "" && <p className="font-medium">{String(label)}</p>}
      {payload.map((p) => (
        <p key={String(p.name)} className="text-ink-mid">
          {p.name}: {String(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ChartTooltip(
  props: ComponentProps<typeof RechartsTooltip>,
): React.JSX.Element {
  return <RechartsTooltip {...props} />;
}
