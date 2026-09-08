import type { ClientInfo, SkillRecord, UsageCounters, UsageRankEntry } from "../skills/types.js";

export const STATS_TOP_N = 8;

export function coverageOf(skills: SkillRecord[]): { linked: number; total: number } {
  return { linked: skills.filter((s) => s.visibleIn.length > 0).length, total: skills.length };
}

export function recentSkills(skills: SkillRecord[], limit: number): SkillRecord[] {
  return [...skills]
    .sort((a, b) => b.installedAt.localeCompare(a.installedAt) || a.dirName.localeCompare(b.dirName))
    .slice(0, limit);
}

export function topN<T>(rows: readonly T[], n: number): T[] {
  return rows.slice(0, n);
}

export function shareOf(part: number, all: number): number {
  if (all <= 0) return 0;
  return part / all;
}

export function formatShare(part: number, all: number): string {
  return String(Math.round(shareOf(part, all) * 100)) + "%";
}

export function usageSum(rows: readonly { total: number }[]): number {
  return rows.reduce((s, r) => s + r.total, 0);
}

export function usageRows(
  skills: SkillRecord[],
  ranking: UsageRankEntry[],
  counters: Map<string, UsageCounters>,
): { hash: string; name: string; total: number; show: number; enable: number }[] {
  const byHash = new Map(skills.map((s) => [s.hash, s.dirName]));
  if (ranking.length > 0) {
    return ranking.map((r) => ({
      hash: r.skillHash,
      name: byHash.get(r.skillHash) ?? r.skillHash.slice(0, 12),
      total: r.total,
      show: r.show,
      enable: r.enable,
    }));
  }
  return skills
    .map((s) => {
      const u = counters.get(s.hash) ?? { show: 0, enable: 0 };
      return { hash: s.hash, name: s.dirName, total: u.show + u.enable, show: u.show, enable: u.enable };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function appDistribution(
  skills: SkillRecord[],
  clients: ClientInfo[],
): { id: string; enabled: number; total: number; coverage: number }[] {
  return clients
    .map((c) => {
      const enabled = skills.filter((s) => s.visibleIn.includes(c.clientId)).length;
      const total = skills.length;
      return { id: c.clientId, enabled, total, coverage: shareOf(enabled, total) };
    })
    .sort((a, b) => b.coverage - a.coverage || b.enabled - a.enabled || a.id.localeCompare(b.id));
}

export function sourceDistribution(skills: SkillRecord[]): { kind: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of skills) {
    const kinds = s.origins.length === 0 ? ["未标记"] : [...new Set(s.origins.map((o) => o.kind || "未标记"))];
    for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

export function chartHeightPx(rows: number): number {
  return Math.max(160, rows * 36 + 48);
}
