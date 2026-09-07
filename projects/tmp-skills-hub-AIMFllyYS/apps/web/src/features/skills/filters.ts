import type { GroupDef, SkillRecord } from "./types.js";

export interface SkillFilters {
  query: string;
  sourceKind: string;
  groupId: string;
}

export const ALL_SOURCE = "all";
export const ALL_GROUP = "all";

/** 按搜索词、来源 kind、分组过滤(纯函数,便于测试与复用)。 */
export function applyFilters(skills: SkillRecord[], groups: GroupDef[], f: SkillFilters): SkillRecord[] {
  const q = f.query.trim().toLowerCase();
  return skills.filter((s) => {
    if (q !== "" && !s.dirName.toLowerCase().includes(q) && !s.meta.description.toLowerCase().includes(q)) return false;
    if (f.sourceKind !== ALL_SOURCE && !s.origins.some((o) => o.kind === f.sourceKind)) return false;
    if (f.groupId !== ALL_GROUP) {
      const g = groups.find((x) => x.id === f.groupId);
      if (g === undefined || !g.memberHashes.includes(s.hash)) return false;
    }
    return true;
  });
}
