/**
 * GitHub 目录树落盘(#40)。纯 fs 操作:把(树条目 → 内容)的清单
 * 写成标准 skill 文件夹,供 adopt 走同一套验证与去重。
 * 路径安全:条目路径必须是 POSIX 相对路径,不允许 .. 与绝对路径,
 * 防止仓库内的恶意路径逃出目标目录。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface GitHubFileEntry {
  /** POSIX 相对路径,如 "SKILL.md"、"scripts/build.sh" */
  path: string;
  contents: string;
}

/** 条目路径是否安全(相对、不含 ..、不以 / 或反斜杠开头)。 */
export function isSafeRelativePath(rel: string): boolean {
  if (rel === "" || rel.startsWith("/") || rel.includes("\\")) return false;
  const segments = rel.split("/");
  return segments.every((s) => s !== "" && s !== "." && s !== ".." && !s.includes(":") && !s.includes("\\"));
}

/**
 * 把条目清单写入 destDir(自动建目录)。
 * 任一条目不安全即抛错(整批不落盘,不产生半个 skill)。
 */
export async function writeGitHubEntries(destDir: string, entries: GitHubFileEntry[]): Promise<void> {
  for (const entry of entries) {
    if (!isSafeRelativePath(entry.path)) {
      throw new Error("GitHub 条目路径不安全,已中止: " + entry.path);
    }
  }
  for (const entry of entries) {
    const full = path.join(destDir, ...entry.path.split("/"));
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, entry.contents, "utf8");
  }
}
