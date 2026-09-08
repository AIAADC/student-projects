import { describe, expect, it } from "vitest";
import type { ClientInfo, SkillRecord } from "../skills/types.js";
import {
  appDistribution,
  chartHeightPx,
  coverageOf,
  formatShare,
  shareOf,
  sourceDistribution,
  STATS_TOP_N,
  topN,
  usageRows,
  usageSum,
} from "./stats-model.js";

function skill(name: string, visibleIn: string[], origins: string[] = []): SkillRecord {
  return {
    hash: name.padEnd(64, "0"),
    dirName: name,
    meta: { name, description: name },
    origins: origins.map((kind) => ({ kind, reference: name })),
    visibleIn,
    installedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("stats-model", () => {
  it("coverageOf 只计至少挂到一个应用的 skill", () => {
    const skills = [skill("a", ["claude"]), skill("b", []), skill("c", ["cursor", "claude"])];
    expect(coverageOf(skills)).toEqual({ linked: 2, total: 3 });
  });

  it("appDistribution 按客户端计启用数", () => {
    const skills = [skill("a", ["claude"]), skill("b", ["claude", "cursor"])];
    const clients: ClientInfo[] = [
      { clientId: "claude", skillsDir: "/c" },
      { clientId: "cursor", skillsDir: "/u" },
    ];
    expect(appDistribution(skills, clients)).toEqual([
      { id: "claude", enabled: 2, total: 2, coverage: 1 },
      { id: "cursor", enabled: 1, total: 2, coverage: 0.5 },
    ]);
  });

  it("sourceDistribution 按来源种类计数", () => {
    const skills = [skill("a", [], ["local"]), skill("b", [], ["github"]), skill("c", [], ["local"])];
    expect(sourceDistribution(skills)).toEqual([
      { kind: "local", count: 2 },
      { kind: "github", count: 1 },
    ]);
  });

  it("usageRows 优先用 ranking", () => {
    const skills = [skill("alpha", [])];
    const rows = usageRows(skills, [{ skillHash: skills[0]!.hash, total: 9, show: 4, enable: 5 }], new Map());
    expect(rows[0]).toEqual({ hash: skills[0]!.hash, name: "alpha", total: 9, show: 4, enable: 5 });
  });

  it("usageRows 按 GET /api/stats 的 skillHash 解析,不读 hash", () => {
    const skills = [skill("alpha", [])];
    const wire = { skillHash: skills[0]!.hash, show: 0, enable: 2, total: 2 };
    expect("hash" in wire).toBe(false);
    const rows = usageRows(skills, [wire], new Map());
    expect(rows[0]).toEqual({ hash: skills[0]!.hash, name: "alpha", total: 2, show: 0, enable: 2 });
  });

  it("usageRows 库存对不上时用 skillHash 前 12 位,不抛", () => {
    const orphan = "5b715426f4c8be86bc50b65171c4c43435cec6bc02d1025f2e40988551f304a5";
    const rows = usageRows([], [{ skillHash: orphan, show: 0, enable: 2, total: 2 }], new Map());
    expect(rows[0]).toEqual({ hash: orphan, name: orphan.slice(0, 12), total: 2, show: 0, enable: 2 });
  });

  it("shareOf / formatShare 总量为 0 时是 0%", () => {
    expect(shareOf(3, 0)).toBe(0);
    expect(formatShare(3, 0)).toBe("0%");
    expect(formatShare(1, 4)).toBe("25%");
  });

  it("topN 只切前 n 条,STATS_TOP_N 是 8", () => {
    expect(STATS_TOP_N).toBe(8);
    expect(topN([1, 2, 3, 4], 2)).toEqual([1, 2]);
    expect(topN([1], 8)).toEqual([1]);
  });

  it("usageSum 加总,chartHeightPx 随条数增高", () => {
    expect(usageSum([{ total: 2 }, { total: 3 }])).toBe(5);
    expect(chartHeightPx(8)).toBeGreaterThan(chartHeightPx(2));
    expect(chartHeightPx(1)).toBeGreaterThanOrEqual(160);
  });
});
