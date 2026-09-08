import { describe, expect, it } from "vitest";
import type { ClientInfo, SkillRecord } from "../skills/types.js";
import { appsCoverageHint, enabledCountForClient, groupClientIds, sortClientsForApps } from "./apps-layout.js";

function client(id: string): ClientInfo {
  return { clientId: id, skillsDir: "/x/" + id };
}

function skill(dirName: string, visibleIn: string[]): SkillRecord {
  return {
    hash: dirName,
    dirName,
    meta: { name: dirName, description: dirName + " desc" },
    origins: [],
    visibleIn,
    installedAt: "2026-08-01T00:00:00.000Z",
  };
}

describe("sortClientsForApps", () => {
  it("先按已启用数降序,同数时 cursor 先于冷门 id", () => {
    const skills = [skill("a", ["trae", "cursor"]), skill("b", ["trae"])];
    const ordered = sortClientsForApps(
      [client("workbuddy"), client("trae"), client("cursor")],
      skills,
    ).map((c) => c.clientId);
    expect(ordered).toEqual(["trae", "cursor", "workbuddy"]);
  });

  it("全未启用时按常用 id,再按名字", () => {
    const ordered = sortClientsForApps(
      [client("workbuddy"), client("agents"), client("cursor")],
      [],
    ).map((c) => c.clientId);
    expect(ordered).toEqual(["cursor", "agents", "workbuddy"]);
  });
});

describe("appsCoverageHint", () => {
  it("空覆盖一句说清", () => {
    expect(appsCoverageHint(0, 12)).toBe("还没挂到这个应用。点全部启用。系统目录不在此列。");
  });

  it("已有启用时报分数", () => {
    expect(appsCoverageHint(3, 12)).toContain("已启用 3 / 12");
  });
});

describe("enabledCountForClient", () => {
  it("只计 visibleIn 含该客户端的", () => {
    expect(enabledCountForClient([skill("a", ["cursor"]), skill("b", [])], "cursor")).toBe(1);
  });
});

describe("groupClientIds", () => {
  it("按 cursor / claude / 其他分组且保持原 id", () => {
    expect(groupClientIds(["trae", "cursor", "claude-code", "agents"])).toEqual([
      { key: "cursor", label: "Cursor", ids: ["cursor"] },
      { key: "claude", label: "Claude", ids: ["claude-code"] },
      { key: "other", label: "其他", ids: ["trae", "agents"] },
    ]);
  });
});
