import { describe, expect, it } from "vitest";
import { formatBatchResult, hashesByClient, hashesForApply } from "./batch-links.js";
import type { LinkDiffItem, LinksPreviewResponse } from "./types.js";

function item(hash: string, clientId: string, dirName = hash): LinkDiffItem {
  return { hash, dirName, clientId, dest: "/x/" + dirName };
}

function preview(partial: Partial<LinksPreviewResponse>): LinksPreviewResponse {
  return {
    ok: true,
    command: "links-preview",
    action: "enable",
    add: 0,
    remove: 0,
    conflictCount: 0,
    wouldCreate: [],
    wouldRemove: [],
    conflicts: [],
    ...partial,
  };
}

describe("hashesForApply", () => {
  it("enable 只收 wouldCreate,冲突计 skipped", () => {
    const p = preview({
      action: "enable",
      wouldCreate: [item("a", "cursor"), item("a", "cursor"), item("b", "cursor")],
      conflictCount: 3,
    });
    expect(hashesForApply(p, "enable")).toEqual({ hashes: ["a", "b"], skipped: 3 });
  });

  it("disable 只收 wouldRemove", () => {
    const p = preview({
      action: "disable",
      wouldRemove: [item("c", "codex")],
      conflictCount: 1,
    });
    expect(hashesForApply(p, "disable")).toEqual({ hashes: ["c"], skipped: 1 });
  });
});

describe("hashesByClient", () => {
  it("按 clientId 去重切开", () => {
    const p = preview({
      wouldCreate: [item("a", "cursor"), item("b", "cursor"), item("a", "codex")],
    });
    const map = hashesByClient(p, "enable");
    expect(map.get("cursor")).toEqual(["a", "b"]);
    expect(map.get("codex")).toEqual(["a"]);
  });
});

describe("formatBatchResult", () => {
  it("启用带跳过占用,并说明运行中的应用未必立刻看见", () => {
    expect(formatBatchResult("enable", 4, 0, 2)).toBe(
      "已启用 4 条链接；跳过占用 2 处。磁盘已改；正在运行的应用可能仍要新开对话。",
    );
  });

  it("启用 0 条不追加运行中应用说明", () => {
    expect(formatBatchResult("enable", 0, 0, 2)).toBe("没有新增启用；跳过占用 2 处");
  });

  it("停用无跳过", () => {
    expect(formatBatchResult("disable", 0, 3, 0)).toBe("已停用 3 条链接");
  });
});
