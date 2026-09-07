import type { SkillRecord } from "@skills-hub/core";

/** 名称解析失败:0 命中 vs 哈希前缀不唯一。HTTP 映射 404 / 400。 */
export type ResolveSkillFailure = { ok: false; code: "not-found" | "ambiguous"; message: string };

export type ResolveSkillResult = { ok: true; skill: SkillRecord } | ResolveSkillFailure;

/**
 * CLI 与 HTTP 共用的唯一匹配器:
 * 1. dirName 精确命中
 * 2. 否则大小写不敏感的唯一哈希前缀(startsWith)
 * 3. 0 命中 → not-found;前缀命中多于 1 → ambiguous,绝不静默取第一条
 */
export function resolveSkill(needle: string, skills: SkillRecord[]): ResolveSkillResult {
  const exact = skills.find((s) => s.dirName === needle);
  if (exact !== undefined) return { ok: true, skill: exact };
  const prefix = needle.toLowerCase();
  const byHash = skills.filter((s) => s.hash.startsWith(prefix));
  if (byHash.length === 1) return { ok: true, skill: byHash[0]! };
  if (byHash.length > 1) {
    return {
      ok: false,
      code: "ambiguous",
      message: "哈希前缀不唯一: " + needle + " 命中 " + byHash.length + " 个,请用完整哈希或目录名。",
    };
  }
  return {
    ok: false,
    code: "not-found",
    message: "库存中没有 " + needle + "(名字或哈希前缀都不匹配)。先 skills-hub list 看有哪些。",
  };
}

/** CLI 命令用:解析失败抛错,成功返回 dirName 单元素数组。 */
export function resolveNames(needle: string, skills: SkillRecord[]): string[] {
  const hit = resolveSkill(needle, skills);
  if (!hit.ok) throw new Error(hit.message);
  return [hit.skill.dirName];
}
