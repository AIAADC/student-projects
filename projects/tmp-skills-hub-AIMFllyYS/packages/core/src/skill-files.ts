import { lstat, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { hashSkillFolder } from "./hash.js";
import { readStoreIndex, writeStoreIndex } from "./store.js";

/**
 * skill 内容读取(#36):文件树与文件内容,供面板查看器使用。
 * - 路径校验:任何读取都限制在 skillDir 之内(防路径穿越)
 * - 大文件与二进制有明确降级,不把调用方卡死
 * - 确定性:树按 POSIX 相对路径排序,目录在前
 */

export const MAX_TREE_ENTRIES = 500;
export const MAX_FILE_BYTES = 512 * 1024;

export interface SkillFileEntry {
  path: string; // POSIX 相对路径
  kind: "file" | "dir";
  sizeBytes: number;
}

export interface SkillTreeOk {
  ok: true;
  entries: SkillFileEntry[];
  truncated: boolean;
}

export type SkillTreeResult = SkillTreeOk | { ok: false; code: "not-found" | "io-error"; message: string };

/** 递归收集文件树(限制条目数,超出标记 truncated 并停止)。 */
export async function listSkillFiles(skillDir: string): Promise<SkillTreeResult> {
  const entries: SkillFileEntry[] = [];
  let truncated = false;
  const walk = async (dir: string): Promise<boolean> => {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return false;
    }
    names.sort();
    for (const name of names) {
      if (truncated || entries.length >= MAX_TREE_ENTRIES) {
        truncated = true;
        return false;
      }
      const full = path.join(dir, name);
      const st = await lstat(full).catch(() => null);
      if (st === null) continue;
      const rel = path.relative(skillDir, full).split(path.sep).join("/");
      if (st.isDirectory()) {
        entries.push({ path: rel, kind: "dir", sizeBytes: 0 });
        const ok2 = await walk(full);
        if (!ok2) return false;
      } else if (st.isFile()) {
        entries.push({ path: rel, kind: "file", sizeBytes: st.size });
      }
    }
    return true;
  };
  try {
    await walk(skillDir);
  } catch {
    return { ok: false, code: "io-error", message: "读取 skill 目录失败: " + skillDir };
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === "dir" ? -1 : 1));
  return { ok: true, entries, truncated };
}

export type SkillFileReadResult =
  | { ok: true; content: string; sizeBytes: number; binary: false }
  | { ok: false; code: "not-found" | "too-large" | "binary" | "outside" | "io-error"; message: string };

/**
 * 读取单个文件(文本)。约束:
 * - 相对路径必须解析到 skillDir 之内,否则 outside(防穿越)
 * - 超过 MAX_FILE_BYTES → too-large(降级,不加载)
 * - 含 NUL 字节或解码失败 → binary(降级,不加载)
 */
export async function readSkillFile(skillDir: string, relPath: string): Promise<SkillFileReadResult> {
  const safe = path.resolve(skillDir, relPath);
  if (safe !== skillDir && !safe.startsWith(skillDir + path.sep)) {
    return { ok: false, code: "outside", message: "路径越出 skill 目录,已拒绝: " + relPath };
  }
  const st = await lstat(safe).catch(() => null);
  if (st === null || !st.isFile()) return { ok: false, code: "not-found", message: "文件不存在: " + relPath };
  if (st.size > MAX_FILE_BYTES) {
    return { ok: false, code: "too-large", message: "文件过大(" + st.size + " B,上限 " + MAX_FILE_BYTES + " B),已降级不加载" };
  }
  const buf = await readFile(safe).catch(() => null);
  if (buf === null) return { ok: false, code: "io-error", message: "读取失败: " + relPath };
  if (buf.includes(0)) return { ok: false, code: "binary", message: "二进制文件,已降级不渲染: " + relPath };
  return { ok: true, content: buf.toString("utf8"), sizeBytes: st.size, binary: false };
}
/**
 * 保存编辑(#37):把改动写回库存原件(面板编辑 = 全局改)。
 * 流程(任何一步失败都不产生半个文件):
 * 1. 路径校验(防穿越,同读取)
 * 2. 旧内容版本追溯:保存前把旧文件副本写入
 *    <storeRoot>/archive/versions/<dirName>-<stamp>/<relPath>
 *    (归档区天然构成版本历史,回滚 = 从 versions 取回)
 * 3. 原子写:同目录 tmp + rename(中断不留半个文件)
 * 4. 重算整目录哈希,更新 index.json 记录(hash 是快照,不静默失真)
 */

export type SkillSaveResult =
  | { ok: true; newHash: string }
  | { ok: false; code: "outside" | "not-found" | "too-large" | "io-error"; message: string };

export interface SaveSkillFileInput {
  storeRoot: string;
  skillDir: string;
  relPath: string;
  content: string;
}

export async function saveSkillFile({ storeRoot, skillDir, relPath, content }: SaveSkillFileInput): Promise<SkillSaveResult> {
  const safe = path.resolve(skillDir, relPath);
  if (safe !== skillDir && !safe.startsWith(skillDir + path.sep)) {
    return { ok: false, code: "outside", message: "路径越出 skill 目录,已拒绝: " + relPath };
  }
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_FILE_BYTES) {
    return { ok: false, code: "too-large", message: "内容过大(" + bytes + " B,上限 " + MAX_FILE_BYTES + " B)" };
  }
  // 1. 读旧内容(可能不存在 → 视为新建)
  const oldBuf = await readFile(safe).catch(() => null);
  const name = path.basename(skillDir);
  try {
    // 2. 版本追溯:旧内容副本进 archive/versions/
    if (oldBuf !== null) {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, "-");
      const versionDir = path.join(storeRoot, "archive", "versions", name + "-" + stamp);
      const versionFile = path.join(versionDir, relPath);
      await mkdir(path.dirname(versionFile), { recursive: true });
      const tmpV = versionFile + ".tmp-" + process.pid + "-" + Date.now();
      await writeFile(tmpV, oldBuf);
      await rename(tmpV, versionFile);
    }
    // 3. 原子写回原件
    const tmp = path.join(skillDir, "." + path.basename(safe) + ".tmp-" + process.pid + "-" + Date.now());
    await writeFile(tmp, content, "utf8");
    await rename(tmp, safe);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "io-error", message: "写入失败(未产生半个文件): " + reason };
  }
  // 4. 重算哈希并更新 index.json 记录(原子)
  try {
    const newHash = await hashSkillFolder(skillDir);
    const skills = await readStoreIndex(storeRoot);
    const rec = skills.find((s) => s.dirName === name);
    if (rec !== undefined) rec.hash = newHash;
    await writeStoreIndex(storeRoot, skills);
    return { ok: true, newHash };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "io-error", message: "内容已写入,但记录更新失败: " + reason };
  }
}
