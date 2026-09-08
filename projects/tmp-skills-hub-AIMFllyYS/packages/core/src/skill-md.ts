import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillMeta } from "./types.js";

/**
 * 从 SKILL.md 提取通用层元数据(name + description)。
 * 只解析 YAML frontmatter 里的这两个字段,不引入完整 YAML 解析器——
 * 各家扩展字段(display name 等)属于适配层,后续由 ClientAdapter 各自处理。
 */
export function parseSkillMeta(markdown: string): SkillMeta | null {
  // Windows 记事本/PowerShell 写的文件常带 UTF-8 BOM,剥掉再解析
  const text = markdown.charCodeAt(0) === 0xfeff ? markdown.slice(1) : markdown;
  const frontmatter = extractFrontmatter(text);
  if (frontmatter === null) return null;

  const name = readScalar(frontmatter, "name");
  const description = readScalar(frontmatter, "description");
  if (name === null || description === null) return null;
  return { name, description };
}

/** 读取一个 skill 文件夹的 SKILL.md 并解析;缺文件或缺字段返回 null(未达收录最低要求)。 */
export async function readSkillMeta(folderPath: string): Promise<SkillMeta | null> {
  let markdown: string;
  try {
    markdown = await readFile(path.join(folderPath, "SKILL.md"), "utf8");
  } catch {
    return null;
  }
  return parseSkillMeta(markdown);
}

function extractFrontmatter(markdown: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  return match?.[1] ?? null;
}

function readScalar(frontmatter: string, key: string): string | null {
  // 冒号两侧只允许空格/制表符:\s 含换行,会让空值吞掉下一行(如 `name: ` 后跟 description)
  const pattern = new RegExp(`^${key}[ \\t]*:[ \\t]*(.+)$`, "m");
  const raw = pattern.exec(frontmatter)?.[1]?.trim();
  if (raw === undefined || raw === "") return null;
  return raw.replace(/^["']|["']$/g, "");
}
