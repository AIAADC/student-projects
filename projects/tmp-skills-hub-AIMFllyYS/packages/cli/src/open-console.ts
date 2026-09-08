import { spawn } from "node:child_process";

/** 打开默认浏览器。Windows 用 cmd start;macOS open;其它 xdg-open。失败静默。 */
export function openBrowser(url: string): void {
  try {
    const child =
      process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true })
        : process.platform === "darwin"
          ? spawn("open", [url], { stdio: "ignore", detached: true })
          : spawn("xdg-open", [url], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // 打不开浏览器不影响命令本身
  }
}
