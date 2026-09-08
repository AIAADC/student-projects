/**
 * Skill 文件夹内容本体之外的条目。哈希、归档 zip、客户端备份走同一份。
 * 变更等于全库哈希迁移,必须走 issue 评审(core-patterns.md §三)。
 */
export const IGNORED_SKILL_ENTRIES: ReadonlySet<string> = new Set([".git", "node_modules", ".DS_Store", "Thumbs.db"]);

export function isIgnoredSkillEntry(name: string): boolean {
  return IGNORED_SKILL_ENTRIES.has(name);
}
