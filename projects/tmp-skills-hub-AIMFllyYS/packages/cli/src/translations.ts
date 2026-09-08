/**
 * 译文缓存(store-and-paths-v0.md §2.1.1,#208):
 * 翻译是派生产物,存 <storeRoot>/translations/<记录哈希>/<relPath>。
 * 铁律:绝不写回 skills/<name>/ 原件——写回会改内容哈希并经链接泄漏给客户端。
 * 布局常量与读写都在 cli(core 零改动);键用记录哈希,编辑/verify 更新哈希后旧译文自然失效。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** 库存内译文缓存目录名(与 skills/ archive/ tmp/ 并列) */
export const TRANSLATIONS_DIR = "translations";

/** 记录哈希是十六进制内容指纹;只认它,防目录名注入。 */
const HASH_RE = /^[0-9a-f]{8,128}$/i;

export type TranslationReadResult =
  | { ok: true; content: string }
  | { ok: false; code: "bad-usage" | "translation-not-found" | "io-error"; message: string };

export type TranslationWriteResult = { ok: true } | { ok: false; message: string };

/** 解析译文文件的安全绝对路径;哈希非法或 relPath 穿越/绝对/含 NUL 一律 null。 */
export function translationFilePath(storeRoot: string, hash: string, relPath: string): string | null {
  if (!HASH_RE.test(hash)) return null;
  if (relPath === "" || relPath.includes("\0")) return null;
  if (relPath.startsWith("/") || relPath.startsWith("\\")) return null; // 根相对路径一律拒绝
  const base = path.resolve(storeRoot, TRANSLATIONS_DIR, hash);
  const safe = path.resolve(base, "./" + relPath);
  if (safe === base || !safe.startsWith(base + path.sep)) return null;
  return safe;
}

export async function readTranslation(storeRoot: string, hash: string, relPath: string): Promise<TranslationReadResult> {
  const safe = translationFilePath(storeRoot, hash, relPath);
  if (safe === null) return { ok: false, code: "bad-usage", message: "译文缓存路径不合法: " + relPath };
  const content = await readFile(safe, "utf8").catch(() => null);
  if (content === null) return { ok: false, code: "translation-not-found", message: "没有译文缓存: " + relPath };
  return { ok: true, content };
}

/** 落盘(建目录 + 覆盖写)。译文可再生,覆盖旧缓存不算破坏;失败返回原因不抛错。 */
export async function writeTranslation(storeRoot: string, hash: string, relPath: string, content: string): Promise<TranslationWriteResult> {
  const safe = translationFilePath(storeRoot, hash, relPath);
  if (safe === null) return { ok: false, message: "译文缓存路径不合法: " + relPath };
  try {
    await mkdir(path.dirname(safe), { recursive: true });
    await writeFile(safe, content, "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: "译文写入失败: " + (e instanceof Error ? e.message : String(e)) };
  }
}
