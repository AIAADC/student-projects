import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isIgnoredSkillEntry } from "./skill-ignore.js";

/**
 * 计算整个 skill 文件夹的内容哈希(SHA-256)。
 *
 * 确定性保证(违反任意一条,「同一 skill 跨机器同哈希」就破功):
 * - 文件按 POSIX 风格相对路径字典序排序后依次哈希,与遍历顺序、操作系统路径分隔符无关;
 * - 每个文件哈希 `相对路径 + "\0" + 原始字节内容`,路径参与哈希以区分「同内容不同文件名」;
 * - 哈希原始字节,不做换行符归一化——跨机器一致性由 git 仓库统一 LF(.gitattributes)保证,
 *   而不是在哈希层做变换(见 docs/conventions/core-patterns.md)。
 */
export async function hashSkillFolder(folderPath: string): Promise<string> {
  const files = await collectFiles(folderPath);
  files.sort();

  const hash = createHash("sha256");
  for (const relPath of files) {
    hash.update(relPath);
    hash.update("\0");
    hash.update(await readFile(path.join(folderPath, relPath)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** 递归收集 POSIX 风格的相对文件路径,跳过忽略项。 */
async function collectFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (isIgnoredSkillEntry(entry.name)) continue;
    const relPath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, relPath)));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
    // 符号链接不展开:store 里不应出现链接,出现即为异常,交给上层校验。
  }
  return files;
}
