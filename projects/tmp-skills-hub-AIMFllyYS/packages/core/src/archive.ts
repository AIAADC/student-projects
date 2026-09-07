import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashSkillFolder } from "./hash.js";
import { applyLinkSet } from "./link-switch.js";
import { readLinksLedger } from "./links.js";
import { readSkillMeta } from "./skill-md.js";
import { readStoreIndex, writeStoreIndex } from "./store.js";
import { STORE_ARCHIVE_DIR, STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";
import { unzipDirectory, zipDirectory } from "./zip.js";

/**
 * 软删除与归档(#23)。产品铁律:没有真删除。
 * 归档 = 先摘全部受管链接(不留悬空)→ 活跃内容打包成单文件 zip 放进归档区 → 更新清单。
 * 唯一删除活跃 skill 内容的地方,且 zip 落盘成功后才删活跃目录;
 * 需要彻底删除时,只向用户显示归档文件路径,由用户自己动手。
 */

export interface ArchivedSkill {
  file: string;
  name: string;
  sizeBytes: number;
  archivedAt: string;
}

export interface ArchiveOk {
  ok: true;
  dirName: string;
  archiveFile: string;
  sizeBytes: number;
  removedLinks: number;
  archivedAt: string;
}

export interface ArchiveFailed {
  ok: false;
  code: "not-found" | "link-conflict" | "io-error";
  message: string;
  at: string;
}

export type ArchiveResult = ArchiveOk | ArchiveFailed;

export async function archiveSkill(storeRoot: string, dirName: string): Promise<ArchiveResult> {
  // 1. 找记录
  const index = await readStoreIndex(storeRoot);
  const record = index.find((s) => s.dirName === dirName);
  if (record === undefined) {
    return { ok: false, code: "not-found", message: "库存中没有 " + dirName, at: dirName };
  }

  // 2. 摘全部受管链接(按落点分组,逐个集合切换;任一失败 → 整体中止,不半归档)
  const ledger = await readLinksLedger(storeRoot);
  const affected = ledger.filter((e) => e.entryName === dirName);
  if (affected.length > 0) {
    const byDir = new Map<string, typeof ledger>();
    for (const e of affected) {
      const list = byDir.get(e.targetDir) ?? [];
      list.push(e);
      byDir.set(e.targetDir, list);
    }
    for (const targetDir of byDir.keys()) {
      const desired = ledger.filter((x) => x.targetDir === targetDir && x.entryName !== dirName);
      const res = await applyLinkSet(storeRoot, { targetDir, entries: desired });
      if (!res.ok) {
        return {
          ok: false,
          code: "link-conflict",
          message: "摘除链接失败,归档中止: " + res.message,
          at: targetDir,
        };
      }
    }
  }

  // 3. 打包:先在 tmp 构建,验证落盘后 rename 进归档区
  const archivedAt = new Date().toISOString();
  const stamp = archivedAt.slice(0, 19).replace(/[:]/g, "-");
  const zipName = dirName + "-" + stamp + ".zip";
  const tmpZip = path.join(storeRoot, STORE_TMP_DIR, "archive." + process.pid + "-" + Date.now() + ".zip");
  const archiveFile = path.join(storeRoot, STORE_ARCHIVE_DIR, zipName);
  const activeDir = path.join(storeRoot, STORE_SKILLS_DIR, dirName);
  try {
    await writeFile(tmpZip, await zipDirectory(activeDir));
    const st = await lstat(tmpZip);
    if (st.size === 0) throw new Error("zip 为空");
    await rename(tmpZip, archiveFile);
    // 4. zip 已落盘成功,才移除活跃目录(唯一删除活跃内容的路径)
    await rm(activeDir, { recursive: true, force: true });
  } catch (e) {
    await rm(tmpZip, { force: true }).catch(() => undefined);
    return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e), at: activeDir };
  }

  // 5. 更新清单
  await writeStoreIndex(storeRoot, index.filter((s) => s.dirName !== dirName));
  return {
    ok: true,
    dirName,
    archiveFile,
    sizeBytes: (await lstat(archiveFile)).size,
    removedLinks: affected.length,
    archivedAt,
  };
}

/** 列出归档区全部存档(按文件名排序,确定性)。 */
export async function listArchivedSkills(storeRoot: string): Promise<ArchivedSkill[]> {
  const dir = path.join(storeRoot, STORE_ARCHIVE_DIR);
  const files = await readdir(dir).catch(() => []);
  const out: ArchivedSkill[] = [];
  for (const f of files.sort()) {
    const full = path.join(dir, f);
    const st = await lstat(full).catch(() => null);
    if (st === null || !st.isFile()) continue;
    const m = /^(.+)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.zip$/.exec(f);
    out.push({ file: full, name: m?.[1] ?? f, sizeBytes: st.size, archivedAt: st.mtime.toISOString() });
  }
  return out;
}

export interface RestoreOk {
  ok: true;
  dirName: string;
  hash: string;
  archiveFile: string;
}

export interface RestoreFailed {
  ok: false;
  code: "not-found" | "conflict" | "io-error";
  message: string;
}

export type RestoreResult = RestoreOk | RestoreFailed;

/** 从归档 zip 恢复到活跃区。不恢复链接;不删除 zip(没有真删除)。 */
export async function restoreArchivedSkill(storeRoot: string, name: string): Promise<RestoreResult> {
  const archived = await listArchivedSkills(storeRoot);
  const matches = archived.filter((a) => a.name === name || path.basename(a.file) === name);
  if (matches.length === 0) {
    return { ok: false, code: "not-found", message: "归档区没有 " + name };
  }
  const pick = matches[matches.length - 1]!;
  const dest = path.join(storeRoot, STORE_SKILLS_DIR, pick.name);
  const index = await readStoreIndex(storeRoot);
  if (index.some((s) => s.dirName === pick.name) || (await existsDir(dest))) {
    return { ok: false, code: "conflict", message: "活跃区已有 " + pick.name + ",未覆盖" };
  }
  const tmpDir = path.join(storeRoot, STORE_TMP_DIR, "restore." + process.pid + "-" + Date.now());
  try {
    await mkdir(tmpDir, { recursive: true });
    await unzipDirectory(await readFile(pick.file), tmpDir);
    const meta = (await readSkillMeta(tmpDir)) ?? { name: pick.name, description: "" };
    const hash = await hashSkillFolder(tmpDir);
    await rename(tmpDir, dest);
    index.push({
      hash,
      dirName: pick.name,
      meta,
      origins: [{ kind: "archive-restore", reference: pick.file }],
      visibleIn: [], // 权威在台账;JSON 边界 attachVisibleIn
      installedAt: new Date().toISOString(),
    });
    await writeStoreIndex(storeRoot, index);
    return { ok: true, dirName: pick.name, hash, archiveFile: pick.file };
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e) };
  }
}

async function existsDir(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}
