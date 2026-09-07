import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <thead className={cn("bg-surface text-left text-xs tracking-wide text-ink-faint", className)} {...props} />;
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>): React.JSX.Element {
  return <tbody className={cn("divide-y divide-line", className)} {...props} />;
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): React.JSX.Element {
  return (
    <tr
      className={cn(
        "h-10 motion-fill",
        className,
      )}
      {...props}
    />
  );
}

export function TableTh({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <th className={cn("px-3 py-2 font-medium", className)} {...props} />;
}

export function TableTd({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): React.JSX.Element {
  return <td className={cn("px-3 py-2 text-ink-mid", className)} {...props} />;
}
