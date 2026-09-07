import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "@/lib/utils";

/** 可滚动区域：滚动保留、滚动条由全局 CSS 隐藏。虚拟列表不要包这层。 */
export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ScrollAreaPrimitive.Root className={cn("min-h-0 overflow-hidden", className)}>
      <ScrollAreaPrimitive.Viewport className="h-full overscroll-contain">
        <ScrollAreaPrimitive.Content className="min-h-full">{children}</ScrollAreaPrimitive.Content>
      </ScrollAreaPrimitive.Viewport>
    </ScrollAreaPrimitive.Root>
  );
}
