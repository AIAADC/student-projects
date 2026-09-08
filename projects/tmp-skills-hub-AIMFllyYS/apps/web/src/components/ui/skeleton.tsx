import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      className={cn("rounded-lg bg-surface motion-safe:animate-skeleton", className)}
      aria-hidden
    />
  );
}

/** 主区首次加载：三张卡 + 两行，不用「加载中…」当唯一反馈。 */
export function PageSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-label="加载中" data-testid="page-skeleton">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-4 w-64" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-32" />
    </div>
  );
}
