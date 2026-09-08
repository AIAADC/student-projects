import { Toaster as Sonner } from "sonner";

/** 全仓唯一反馈通道：无阴影、浅色、成功自动消失。 */
export function Toaster(): React.JSX.Element {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      duration={4000}
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-lg border border-line bg-white text-sm text-ink-strong shadow-none",
          title: "text-ink-strong",
          description: "text-ink-mid",
          error: "border-red-200 text-red-700",
          success: "border-line text-ink-strong",
          closeButton: "border-line text-ink-faint",
        },
      }}
    />
  );
}
