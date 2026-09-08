import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashSkillFolder } from "./hash.js";
import { readSkillMeta } from "./skill-md.js";
import {
  type DraftRecord,
  readStoreIndexFile,
  writeStoreIndex,
} from "./store.js";
import { STORE_ARCHIVE_DIR, STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";
import type { SkillRecord, SkillSource } from "./types.js";

/**
 * 创建操作的 core 原语(#169)。
 *
 * 刻意独立于 store.ts——adoptSkillFolder 是 content-first 且按内容哈希去重,
 * 两个同模板空 skill 内容相同会撞成 duplicate。创建是 location-first,
 * 去重在 commit 时才生效。物理隔离防止实现者复用 adoptSkillFolder。
 */

export type AllocateOutcome =
  | { kind: "allocated"; draft: DraftRecord; storeDir: string }
  | { kind: "conflict"; dirName: string; reason: string };

export type CommitOutcome =
  | { kind: "committed"; record: SkillRecord }
  | { kind: "draft-not-found"; dirName: string }
  | { kind: "incomplete"; dirName: string; reason: string }
  | { kind: "duplicate"; record: SkillRecord }
  | { kind: "conflict"; dirName: string; reason: string };

export type DiscardOutcome =
  | { kind: "discarded"; dirName: string; archivePath: string }
  | { kind: "draft-not-found"; dirName: string };

const TEMPLATE_SKILL_MD = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nTODO: Write skill instructions here.\n`;

/** Allocate a directory in the store for a new skill draft. */
export async function allocateDraft(
  storeRoot: string,
  dirName: string,
  seed?: { description?: string; origin?: SkillSource },
): Promise<AllocateOutcome> {
  const indexFile = await readStoreIndexFile(storeRoot);

  if (indexFile.skills.some((s) => s.dirName === dirName)) {
    return { kind: "conflict", dirName, reason: "skills[] 中已有同名记录" };
  }
  if (indexFile.drafts.some((d) => d.dirName === dirName)) {
    return { kind: "conflict", dirName, reason: "drafts[] 中已有同名草稿" };
  }

  const dest = path.join(storeRoot, STORE_SKILLS_DIR, dirName);
  if (await exists(dest)) {
    return { kind: "conflict", dirName, reason: "磁盘上已有同名目录" };
  }

  const origin: SkillSource = seed?.origin ?? { kind: "authored", reference: "cli" };
  const description = seed?.description ?? "TODO: describe this skill";
  const draft: DraftRecord = {
    dirName,
    meta: { name: dirName, description },
    origin,
    createdAt: new Date().toISOString(),
  };

  await mkdir(path.join(storeRoot, STORE_TMP_DIR), { recursive: true });
  const tmpDir = path.join(storeRoot, STORE_TMP_DIR, "draft." + process.pid + "-" + Date.now());
  await mkdir(tmpDir, { recursive: true });
  await writeFile(
    path.join(tmpDir, "SKILL.md"),
    TEMPLATE_SKILL_MD(dirName, description),
    "utf8",
  );
  await rename(tmpDir, dest);

  indexFile.drafts.push(draft);
  await writeStoreIndex(storeRoot, indexFile.skills, indexFile.drafts);

  return { kind: "allocated", draft, storeDir: dest };
}

/** Commit a draft: validate SKILL.md, compute hash, move to skills[]. */
export async function commitDraft(storeRoot: string, dirName: string): Promise<CommitOutcome> {
  const indexFile = await readStoreIndexFile(storeRoot);
  const draftIdx = indexFile.drafts.findIndex((d) => d.dirName === dirName);
  if (draftIdx === -1) {
    return { kind: "draft-not-found", dirName };
  }

  const skillDir = path.join(storeRoot, STORE_SKILLS_DIR, dirName);
  const meta = await readSkillMeta(skillDir);
  if (meta === null) {
    return { kind: "incomplete", dirName, reason: "SKILL.md 缺少 name 或 description" };
  }

  const hash = await hashSkillFolder(skillDir);

  const existingByHash = indexFile.skills.find((s) => s.hash === hash);
  if (existingByHash) {
    return { kind: "duplicate", record: existingByHash };
  }

  const existingByName = indexFile.skills.find((s) => s.dirName === dirName);
  if (existingByName) {
    return {
      kind: "conflict",
      dirName,
      reason: "skills[] 中已有同名记录(可能在草稿期间被 adopt 占用)",
    };
  }

  const draft = indexFile.drafts[draftIdx]!;
  const record: SkillRecord = {
    hash,
    dirName,
    meta,
    origins: [draft.origin],
    visibleIn: [], // 权威在台账;JSON 边界 attachVisibleIn
    installedAt: new Date().toISOString(),
  };

  indexFile.skills.push(record);
  indexFile.drafts.splice(draftIdx, 1);
  await writeStoreIndex(storeRoot, indexFile.skills, indexFile.drafts);

  return { kind: "committed", record };
}

/** Discard a draft: move directory to archive/drafts/, remove from drafts[]. */
export async function discardDraft(storeRoot: string, dirName: string): Promise<DiscardOutcome> {
  const indexFile = await readStoreIndexFile(storeRoot);
  const draftIdx = indexFile.drafts.findIndex((d) => d.dirName === dirName);
  if (draftIdx === -1) {
    return { kind: "draft-not-found", dirName };
  }

  const archiveDir = path.join(storeRoot, STORE_ARCHIVE_DIR, "drafts");
  await mkdir(archiveDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = path.join(archiveDir, `${dirName}-${timestamp}`);

  const skillDir = path.join(storeRoot, STORE_SKILLS_DIR, dirName);
  if (await exists(skillDir)) {
    await rename(skillDir, archivePath);
  }

  indexFile.drafts.splice(draftIdx, 1);
  await writeStoreIndex(storeRoot, indexFile.skills, indexFile.drafts);

  return { kind: "discarded", dirName, archivePath };
}

/** List current drafts. */
export async function listDrafts(storeRoot: string): Promise<DraftRecord[]> {
  return (await readStoreIndexFile(storeRoot)).drafts;
}

/**
 * One-step create: allocate + commit in a single call.
 * Used by the human shell where name and description are already known.
 */
export async function createAndCommit(
  storeRoot: string,
  dirName: string,
  description: string,
  origin?: SkillSource,
): Promise<CommitOutcome | AllocateOutcome> {
  const seed: { description: string; origin?: SkillSource } = { description };
  if (origin) seed.origin = origin;
  const allocResult = await allocateDraft(storeRoot, dirName, seed);
  if (allocResult.kind !== "allocated") return allocResult;
  return commitDraft(storeRoot, dirName);
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
