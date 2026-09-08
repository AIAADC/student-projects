import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 库存位置解析(spec §1):显式参数 → 环境变量 → 指针文件 → 报错提示先初始化。
 * core 不触碰 os.homedir():指针文件路径由调用方(cli)计算后注入,
 * 满足 spec §5「home 必须是显式传入的参数」的沙箱铁律。
 */

export interface StoreRootOptions {
  /** 命令行参数 --home <path>(优先级最高) */
  cliHome?: string;
  /** 环境变量 SKILLS_HUB_HOME */
  envHome?: string;
  /** 指针文件绝对路径,如 <home>/.skills-hub/config.json(优先级最低) */
  pointerFilePath?: string;
}

export type StoreRootSource = "cli" | "env" | "pointer";

export type StoreRootResolution =
  | { ok: true; source: StoreRootSource; storeRoot: string }
  | {
      ok: false;
      reason: "not-configured" | "invalid-path" | "invalid-pointer";
      /** 面向用户的可操作错误信息 */
      message: string;
    };

const INIT_HINT = "请先运行 `skills-hub init` 设置库存位置";

/**
 * 解析库存根目录。返回 ok:false 时绝不静默回退到用户目录,
 * message 指向下一步操作(spec §1 第 4 条)。
 */
export async function resolveStoreRoot(opts: StoreRootOptions): Promise<StoreRootResolution> {
  const explicit: Array<{ source: StoreRootSource; value: string | undefined }> = [
    { source: "cli", value: opts.cliHome },
    { source: "env", value: opts.envHome },
  ];
  for (const c of explicit) {
    const v = c.value?.trim();
    if (v === undefined || v === "") continue;
    if (!path.isAbsolute(v)) {
      return { ok: false, reason: "invalid-path", message: `库存根目录必须是绝对路径,收到: "${v}"。` };
    }
    return { ok: true, source: c.source, storeRoot: v };
  }

  if (opts.pointerFilePath !== undefined) {
    const fromPointer = await readPointerStoreRoot(opts.pointerFilePath);
    if (fromPointer === null) {
      return {
        ok: false,
        reason: "not-configured",
        message: `指针文件不存在、格式无效或缺少 storeRoot。${INIT_HINT}。`,
      };
    }
    if (!path.isAbsolute(fromPointer)) {
      return { ok: false, reason: "invalid-pointer", message: `指针文件中的 storeRoot 必须是绝对路径,收到: "${fromPointer}"。` };
    }
    return { ok: true, source: "pointer", storeRoot: fromPointer };
  }

  return { ok: false, reason: "not-configured", message: `未配置库存位置。${INIT_HINT}。` };
}

/**
 * 读取指针文件中的 storeRoot。文件缺失、JSON 无效或缺少非空 storeRoot 字段一律返回 null
 * (解析层不区分,由 resolveStoreRoot 统一给出可操作错误)。
 */
export async function readPointerStoreRoot(pointerFilePath: string): Promise<string | null> {
  let raw: string;
  try {
    raw = await readFile(pointerFilePath, "utf8");
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(raw) as { storeRoot?: unknown };
    if (typeof data.storeRoot !== "string") return null;
    const v = data.storeRoot.trim();
    return v === "" ? null : v;
  } catch {
    return null;
  }
}
