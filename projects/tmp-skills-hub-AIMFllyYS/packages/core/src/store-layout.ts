import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 库存目录布局初始化(spec §2)。
 * 幂等铁律:manifest.json 已存在(且合法)则原样返回,不覆盖、不删除任何已有内容。
 */

export const STORE_LAYOUT_VERSION = 1;

/** 活跃 skill 真身目录(符号链接指向这里) */
export const STORE_SKILLS_DIR = "skills";
/** 软删除归档目录(<name>-<ISO时间戳>.zip) */
export const STORE_ARCHIVE_DIR = "archive";
/** 原子操作暂存目录(操作结束即清空) */
export const STORE_TMP_DIR = "tmp";

/**
 * §2 布局中的四个数据文件。内容契约由各自 issue 定义
 * (links.json → #20、groups.json → #25、stats.json → #27、index.json → #28),
 * init 只落空对象占位,不臆造契约。
 */
export const STORE_DATA_FILES = ["index.json", "links.json", "groups.json", "stats.json"] as const;

export interface StoreManifest {
  version: number;
  createdAt: string;
}

export interface InitLayoutResult {
  /** true = 本次新建;false = 已初始化过(幂等跳过) */
  created: boolean;
  storeRoot: string;
  manifest: StoreManifest;
}

/** 建立 §2 目录布局。重复执行不破坏已有内容。 */
export async function initializeStoreLayout(storeRoot: string): Promise<InitLayoutResult> {
  const manifestPath = path.join(storeRoot, "manifest.json");
  const existing = await readManifest(manifestPath);
  if (existing !== null) {
    return { created: false, storeRoot, manifest: existing };
  }

  for (const dir of [STORE_SKILLS_DIR, STORE_ARCHIVE_DIR, STORE_TMP_DIR]) {
    await mkdir(path.join(storeRoot, dir), { recursive: true });
  }

  const manifest: StoreManifest = {
    version: STORE_LAYOUT_VERSION,
    createdAt: new Date().toISOString(),
  };
  await writeFileAtomic(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  for (const file of STORE_DATA_FILES) {
    await writeFileAtomic(path.join(storeRoot, file), "{}\n");
  }
  return { created: true, storeRoot, manifest };
}

/** 读 manifest;文件不存在返回 null,存在但格式非法抛错(绝不静默覆盖用户内容)。 */
async function readManifest(manifestPath: string): Promise<StoreManifest | null> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`manifest.json 已存在但无法解析: ${manifestPath}`);
  }
  const v = data as { version?: unknown; createdAt?: unknown };
  if (typeof v.version !== "number" || typeof v.createdAt !== "string") {
    throw new Error(`manifest.json 已存在但缺少 version/createdAt 字段: ${manifestPath}`);
  }
  return { version: v.version, createdAt: v.createdAt };
}

/** 原子写:先写 tmp 再 rename,避免读到半成品(spec §2 tmp 目录的用途)。 */
async function writeFileAtomic(target: string, content: string): Promise<void> {
  const tmpPath = path.join(
    path.dirname(target),
    STORE_TMP_DIR,
    `${path.basename(target)}.init-${process.pid}-${Date.now()}.tmp`,
  );
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, target);
}
