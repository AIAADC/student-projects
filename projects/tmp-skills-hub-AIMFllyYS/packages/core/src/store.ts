import { cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashSkillFolder } from "./hash.js";
import { migrateVersionedData, type MigrationStep } from "./migrate.js";
import { readSkillMeta } from "./skill-md.js";
import { STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";
import type { SkillMeta, SkillRecord, SkillSource } from "./types.js";

/**
 * 库存读写与收录(去重入库)内核,spec §2.2/§2.3/§3。
 * - 去重按整个文件夹内容哈希,不按文件名;目录名用 name(人类可读、路径稳定)
 * - 同内容重复收录 → 幂等:只追加来源,不产生第二份
 * - 同名不同内容 → 冲突:绝不覆盖,交给用户决定
 * - 缺 name/description → invalid,出现在收录报告而不是被静默跳过
 * - index.json 写入原子化(先写 tmp 再 rename),中断不产生半文件
 */

/** index.json 文件格式版本。契约演进时递增,读取端按版本迁移。 */
export const STORE_INDEX_VERSION = 2;

export interface DraftRecord {
  dirName: string;
  meta: SkillMeta;
  origin: SkillSource;
  createdAt: string;
}

export interface StoreIndexFile {
  version: number;
  skills: SkillRecord[];
  drafts: DraftRecord[];
}

const INDEX_MIGRATIONS: MigrationStep<StoreIndexFile>[] = [
  {
    from: 1,
    to: 2,
    up: (data) => ({ ...data, drafts: [] }),
  },
];

/** 一次收录的输入:源文件夹 + 来源(溯源展示用)。 */
export interface AdoptInput {
  folderPath: string;
  origin: SkillSource;
}

export type AdoptionOutcome =
  | { kind: "adopted"; record: SkillRecord }
  | { kind: "duplicate"; record: SkillRecord } // 同内容幂等,来源已追加
  | { kind: "conflict"; name: string; existingHash: string; incomingHash: string }
  | { kind: "invalid"; folderPath: string; reason: string };

export interface AdoptionReport {
  outcomes: AdoptionOutcome[];
  adopted: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
}

/** 读取库存清单;文件缺失或为空占位({})视为空库,JSON 损坏抛错(不静默重置)。 */
export async function readStoreIndex(storeRoot: string): Promise<SkillRecord[]> {
  return (await readStoreIndexFile(storeRoot)).skills;
}

/** 读取完整 index 文件(含 drafts)。 */
export async function readStoreIndexFile(storeRoot: string): Promise<StoreIndexFile> {
  const indexPath = path.join(storeRoot, "index.json");
  let raw: string;
  try {
    raw = await readFile(indexPath, "utf8");
  } catch {
    return { version: STORE_INDEX_VERSION, skills: [], drafts: [] };
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("index.json 无法解析: " + indexPath);
  }
  const file = data as Partial<StoreIndexFile>;
  if (file.version === undefined && file.skills === undefined) {
    return { version: STORE_INDEX_VERSION, skills: [], drafts: [] };
  }
  if (typeof file.version !== "number" || !Array.isArray(file.skills)) {
    throw new Error("index.json 版本或结构不支持: " + indexPath);
  }
  const asFile: StoreIndexFile = {
    version: file.version,
    skills: file.skills,
    drafts: Array.isArray(file.drafts) ? file.drafts : [],
  };
  return migrateVersionedData(asFile, {
    current: STORE_INDEX_VERSION,
    chain: INDEX_MIGRATIONS,
    label: "index.json",
  });
}

/** 原子写库存清单:先写 tmp 再 rename。保留 drafts。 */
export async function writeStoreIndex(
  storeRoot: string,
  skills: SkillRecord[],
  drafts?: DraftRecord[],
): Promise<void> {
  const indexPath = path.join(storeRoot, "index.json");
  const existingDrafts = drafts ?? (await readStoreIndexFile(storeRoot)).drafts;
  const content = JSON.stringify(
    { version: STORE_INDEX_VERSION, skills, drafts: existingDrafts },
    null,
    2,
  ) + "\n";
  const tmpPath = path.join(
    storeRoot,
    STORE_TMP_DIR,
    "index." + process.pid + "-" + Date.now() + ".tmp",
  );
  await mkdir(path.dirname(tmpPath), { recursive: true });
  await writeFile(tmpPath, content, "utf8");
  await rename(tmpPath, indexPath);
}

/**
 * 收录一个 skill 文件夹(复制进库存,不动源)。
 * 优先级:内容哈希去重 → 同名冲突检测 → 全新收录。
 */
export interface AdoptOptions {
  /** 预演模式:只计算与报告,不复制、不写清单、不追加来源。 */
  dryRun?: boolean;
}

export async function adoptSkillFolder(
  storeRoot: string,
  folderPath: string,
  origin: SkillSource,
  options?: AdoptOptions,
): Promise<AdoptionOutcome> {
  const dryRun = options?.dryRun === true;
  const meta = await readSkillMeta(folderPath);
  if (meta === null) {
    return { kind: "invalid", folderPath, reason: "缺少 name 或 description(SKILL.md 未达标)" };
  }

  const incomingHash = await hashSkillFolder(folderPath);
  const skills = await readStoreIndex(storeRoot);
  const byHash = skills.find((s) => s.hash === incomingHash);
  if (byHash !== undefined) {
    // 同内容幂等:只追加新来源,不产生第二份
    if (!dryRun && !byHash.origins.some((o) => o.kind === origin.kind && o.reference === origin.reference)) {
      byHash.origins.push(origin);
      await writeStoreIndex(storeRoot, skills);
    }
    return { kind: "duplicate", record: byHash };
  }

  const byName = skills.find((s) => s.dirName === meta.name);
  if (byName !== undefined) {
    return {
      kind: "conflict",
      name: meta.name,
      existingHash: byName.hash,
      incomingHash,
    };
  }

  // 目录已存在但清单无记录:疑似半成品/手动放置,绝不覆盖
  const dest = path.join(storeRoot, STORE_SKILLS_DIR, meta.name);
  if (await exists(dest)) {
    return { kind: "conflict", name: meta.name, existingHash: "?", incomingHash };
  }

  const record: SkillRecord = {
    hash: incomingHash,
    dirName: meta.name,
    meta,
    origins: [origin],
    visibleIn: [], // 权威在台账;JSON 边界 attachVisibleIn
    installedAt: new Date().toISOString(),
  };

  if (!dryRun) {
    // 原子入位:先复制到 tmp 再 rename 到 skills/<name>
    await mkdir(path.join(storeRoot, STORE_TMP_DIR), { recursive: true });
    const tmpDir = path.join(storeRoot, STORE_TMP_DIR, "adopt." + process.pid + "-" + Date.now());
    await cp(folderPath, tmpDir, { recursive: true });
    await rename(tmpDir, dest);
    skills.push(record);
    await writeStoreIndex(storeRoot, skills);
  }
  return { kind: "adopted", record };
}

/** 批量收录并产出报告(缺 name/description 的目录进报告而不是被静默跳过)。 */
export async function adoptMany(
  storeRoot: string,
  inputs: AdoptInput[],
  options?: AdoptOptions,
): Promise<AdoptionReport> {
  const outcomes: AdoptionOutcome[] = [];
  for (const input of inputs) {
    outcomes.push(await adoptSkillFolder(storeRoot, input.folderPath, input.origin, options));
  }
  const count = (kind: AdoptionOutcome["kind"]) => outcomes.filter((o) => o.kind === kind).length;
  return {
    outcomes,
    adopted: count("adopted"),
    duplicates: count("duplicate"),
    conflicts: count("conflict"),
    invalid: count("invalid"),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
