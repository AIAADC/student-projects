import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatResetPreview,
  loadCatalogRefresh,
  loadCatalogSnapshot,
  patchClientStates,
  patchSkillVisibility,
  renameSkillHash,
} from "./catalog.js";
import type { BackupsPreviewResponse, ClientSkillStatesResponse, SkillRecord } from "./types.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function skill(hash: string, visibleIn: string[] = []): SkillRecord {
  return {
    hash,
    dirName: hash,
    meta: { name: hash, description: hash },
    origins: [],
    visibleIn,
    installedAt: "2026-08-01T00:00:00.000Z",
  };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("patchSkillVisibility", () => {
  it("启用补上 clientId,已有则不重复", () => {
    const added = patchSkillVisibility([skill("a", [])], "a", "cursor", true);
    expect(added[0]?.visibleIn).toEqual(["cursor"]);
    const again = patchSkillVisibility(added, "a", "cursor", true);
    expect(again[0]?.visibleIn).toEqual(["cursor"]);
  });

  it("停用摘掉该 clientId,其它行不动", () => {
    const next = patchSkillVisibility(
      [skill("a", ["cursor", "codex"]), skill("b", ["cursor"])],
      "a",
      "cursor",
      false,
    );
    expect(next[0]?.visibleIn).toEqual(["codex"]);
    expect(next[1]?.visibleIn).toEqual(["cursor"]);
  });
});

describe("patchClientStates", () => {
  const prev: ClientSkillStatesResponse = {
    ok: true,
    command: "client-skill-states",
    clientId: "cursor",
    skillsDir: "/x",
    enabled: 1,
    total: 2,
    rows: [
      { hash: "a", state: "managed", detail: "已启用" },
      { hash: "b", state: "off", detail: "未启用" },
    ],
  };

  it("空或其它应用原样返回", () => {
    expect(patchClientStates(null, "a", "cursor", true)).toBeNull();
    expect(patchClientStates(prev, "a", "codex", false)).toBe(prev);
  });

  it("开关后改行状态并重算 enabled", () => {
    const off = patchClientStates(prev, "a", "cursor", false);
    expect(off?.rows[0]?.state).toBe("off");
    expect(off?.enabled).toBe(0);
    const on = patchClientStates(prev, "b", "cursor", true);
    expect(on?.rows[1]?.state).toBe("managed");
    expect(on?.enabled).toBe(2);
  });
});

describe("renameSkillHash", () => {
  it("只改命中的 hash", () => {
    const next = renameSkillHash([skill("old"), skill("keep")], "old", "new");
    expect(next.map((s) => s.hash)).toEqual(["new", "keep"]);
  });
});

describe("formatResetPreview", () => {
  it("用预览计数写确认句,不含占位旁路路径", () => {
    const preview: BackupsPreviewResponse = {
      ok: true,
      command: "backups-preview",
      snapshotId: "snap-1",
      dryRun: true,
      clients: 3,
      skills: 12,
      files: 40,
      links: 8,
      wouldRestore: [],
      skippedOwnDirs: [],
      asideStore: "/tmp/.pre-reinit",
      asidePointer: "/tmp/.pre-reinit",
    };
    const text = formatResetPreview(preview);
    expect(text).toContain("snap-1");
    expect(text).toContain("3 个应用");
    expect(text).toContain("12 项技能");
    expect(text).toContain("40 文件");
    expect(text).toContain("8 链接");
    expect(text).not.toContain("/tmp/.pre-reinit");
  });
});

describe("loadCatalogSnapshot / loadCatalogRefresh", () => {
  it("doctor 与备份失败时降级,目录仍就绪", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/skills") {
        return jsonRes({ ok: true, command: "skills", storeRoot: "/s", total: 0, skills: [] });
      }
      if (url === "/api/clients") return jsonRes({ ok: true, command: "clients", clients: [] });
      if (url === "/api/stats") {
        return jsonRes({ ok: true, command: "stats", stats: { version: 1, counters: {} }, ranking: [] });
      }
      if (url === "/api/archive") {
        return jsonRes({ ok: true, command: "archive", verb: "list", archiveDir: "/a", archived: [] });
      }
      if (url === "/api/groups") return jsonRes({ ok: true, command: "groups", version: 1, groups: [] });
      if (url === "/api/doctor" || url === "/api/backups") return jsonRes({ ok: false, message: "down" }, 500);
      throw new Error("unexpected " + url);
    });
    const snap = await loadCatalogSnapshot();
    expect(snap.storeRoot).toBe("/s");
    expect(snap.doctor).toBeNull();
    expect(snap.backups).toBeNull();
    expect(snap.groups).toEqual([]);
  });

  it("轻量刷新在无选中应用时不拉 skill-states", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url === "/api/skills") {
        return jsonRes({ ok: true, command: "skills", storeRoot: "/s", total: 0, skills: [] });
      }
      if (url === "/api/groups") return jsonRes({ ok: true, command: "groups", version: 1, groups: [] });
      throw new Error("unexpected " + url);
    });
    const next = await loadCatalogRefresh(null);
    expect(next.clientStates).toBeNull();
    expect(urls.some((u) => u.includes("skill-states"))).toBe(false);
  });
});
