import os from "node:os";

/**
 * 解析 CLI 的 home 参数(只读命令用)。
 *
 * 优先级:--home → SKILLS_HUB_HOME → 真实 home。
 * 前两级是沙箱重定向的唯一入口;最后一级是只读命令(如 scan)的默认行为,
 * 允许直接看真实目录。写操作(adopt / enable 等)的指针文件解析
 * 属于 store 定位逻辑,在库存命令落地时实现(store-and-paths-v0.md §1)。
 */
export function resolveHome(cliHome?: string): string {
  if (cliHome !== undefined && cliHome !== "") return cliHome;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") return envHome;
  return os.homedir();
}
