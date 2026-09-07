import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { archiveSkill, listArchivedSkills, restoreArchivedSkill } from "./archive.js";
import { hashSkillFolder } from "./hash.js";
import { readLinksLedger } from "./links.js";
import { applyLinkSet } from "./link-switch.js";
import { readStoreIndex } from "./store.js";
import { STORE_ARCHIVE_DIR, STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";
import { zipDirectory, zipEntries } from "./zip.js";

/**
 * 软删除与归档(#23):zip 确定性、链接先摘、活跃区移除、清单更新、不存在真删除路径。
 * 全部沙箱。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-archive-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

interface World {
  store: string;
  clientRoot: string;
}

async function world(): Promise<World> {
  const work = await tmp();
  const store = path.join(work, "store");
  for (const d of [STORE_SKILLS_DIR, STORE_ARCHIVE_DIR, STORE_TMP_DIR]) {
    await mkdir(path.join(store, d), { recursive: true });
  }
  const clientRoot = path.join(work, "home", ".claude", "skills");
  await mkdir(clientRoot, { recursive: true });
  return { store, clientRoot };
}

async function makeSkill(store: string, name: string, content: string): Promise<void> {
  const dir = path.join(store, STORE_SKILLS_DIR, name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), content);
}

/** 手动构造一条台账记录(与 adopt 入库后的 shape 一致)。 */
function entry(w: World, id: string, name: string): Record<string, string> {
  return {
    id,
    clientId: "claude",
    scope: "skills",
    targetDir: w.clientRoot,
    entryName: name,
    skillHash: "h-" + name,
    kind: "junction",
    createdAt: "2026-08-16T00:00:00.000Z",
  };
}

describe("zip 打包(#23)", () => {
  it("store 模式:条目齐全、内容一致、可被 zipEntries 解出", async () => {
    const dir = await tmp();
    await mkdir(path.join(dir, "sub"), { recursive: true });
    await writeFile(path.join(dir, "SKILL.md"), "hello");
    await writeFile(path.join(dir, "sub", "notes.md"), "world");
    const buf = await zipDirectory(dir);
    const entries = await zipEntries(buf);
    expect([...entries.keys()].sort()).toEqual(["SKILL.md", "sub/notes.md"]);
    expect(new TextDecoder().decode(entries.get("SKILL.md"))).toBe("hello");
    expect(new TextDecoder().decode(entries.get("sub/notes.md"))).toBe("world");
  });

  it("确定性:相同内容两次打包字节一致", async () => {
    const dir = await tmp();
    await writeFile(path.join(dir, "a.txt"), "aaa");
    await writeFile(path.join(dir, "b.txt"), "bbb");
    const t = new Date("2026-08-16T00:00:00Z");
    const b1 = await zipDirectory(dir, t);
    const b2 = await zipDirectory(dir, t);
    expect(Buffer.from(b1).equals(Buffer.from(b2))).toBe(true);
  });
});

describe("归档(#23)", () => {
  it("归档:活跃区移除、归档区可查、zip 内容与原件一致、清单更新", async () => {
    const w = await world();
    await makeSkill(w.store, "demo", "---\nname: demo\ndescription: d\n---\npayload");
    // 手工入清单 + 台账 + 链接
    const { writeStoreIndex } = await import("./store.js");
    const { upsertLinkEntries } = await import("./links.js");
    await writeStoreIndex(w.store, [{
      dirName: "demo",
      hash: "deadbeef",
      meta: { name: "demo", description: "d" },
      origins: [{ kind: "local-scan", reference: "x" }],
      installedAt: "2026-08-16T00:00:00.000Z",
      visibleIn: ["claude"],
    }]);
    await upsertLinkEntries(w.store, [entry(w, "e1", "demo") as never]);
    const link = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [entry(w, "e1", "demo")] as never });
    expect(link.ok).toBe(true);

    const res = await archiveSkill(w.store, "demo");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.removedLinks).toBe(1);
    // 活跃区没了
    expect(await readdir(path.join(w.store, STORE_SKILLS_DIR))).toEqual([]);
    // 链接摘了
    expect(await readdir(w.clientRoot)).toEqual([]);
    // 归档区有且仅有一份
    const archived = await listArchivedSkills(w.store);
    expect(archived).toHaveLength(1);
    expect(archived[0]!.file).toBe(res.archiveFile);
    expect(archived[0]!.name).toBe("demo");
    // zip 内容与原件一致
    const entries = await zipEntries(new Uint8Array(await readFile(res.archiveFile)));
    expect(new TextDecoder().decode(entries.get("SKILL.md"))).toContain("payload");
    // 清单更新
    expect((await readStoreIndex(w.store)).map((s) => s.dirName)).toEqual([]);
    // 台账干净
    expect(await readLinksLedger(w.store)).toEqual([]);
    // tmp 无残留
    expect(await readdir(path.join(w.store, STORE_TMP_DIR))).toEqual([]);
  });

  it("恢复后内容与归档前逐字节一致,哈希相同", async () => {
    const w = await world();
    const payload = "---\nname: demo\ndescription: d\n---\npayload-restore";
    await makeSkill(w.store, "demo", payload);
    const { writeStoreIndex } = await import("./store.js");
    const hash = await hashSkillFolder(path.join(w.store, STORE_SKILLS_DIR, "demo"));
    await writeStoreIndex(w.store, [{
      dirName: "demo",
      hash,
      meta: { name: "demo", description: "d" },
      origins: [{ kind: "local-scan", reference: "x" }],
      installedAt: "2026-08-16T00:00:00.000Z",
      visibleIn: [],
    }]);
    const archived = await archiveSkill(w.store, "demo");
    expect(archived.ok).toBe(true);
    const restored = await restoreArchivedSkill(w.store, "demo");
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.hash).toBe(hash);
    expect(await readFile(path.join(w.store, STORE_SKILLS_DIR, "demo", "SKILL.md"), "utf8")).toBe(payload);
    expect((await readStoreIndex(w.store)).map((s) => s.hash)).toEqual([hash]);
    expect(await readdir(path.join(w.store, STORE_ARCHIVE_DIR))).toHaveLength(1);
  });

  it("活跃区已有同名则 conflict,不覆盖,zip 仍在", async () => {
    const w = await world();
    await makeSkill(w.store, "demo", "---\nname: demo\ndescription: d\n---\nold");
    const { writeStoreIndex } = await import("./store.js");
    const hash = await hashSkillFolder(path.join(w.store, STORE_SKILLS_DIR, "demo"));
    await writeStoreIndex(w.store, [{
      dirName: "demo",
      hash,
      meta: { name: "demo", description: "d" },
      origins: [{ kind: "local-scan", reference: "x" }],
      installedAt: "2026-08-16T00:00:00.000Z",
      visibleIn: [],
    }]);
    const archived = await archiveSkill(w.store, "demo");
    expect(archived.ok).toBe(true);
    await makeSkill(w.store, "demo", "---\nname: demo\ndescription: d\n---\nlive");
    await writeStoreIndex(w.store, [{
      dirName: "demo",
      hash: "live",
      meta: { name: "demo", description: "d" },
      origins: [{ kind: "local-scan", reference: "x" }],
      installedAt: "2026-08-16T00:00:00.000Z",
      visibleIn: [],
    }]);
    const restored = await restoreArchivedSkill(w.store, "demo");
    expect(restored.ok).toBe(false);
    if (restored.ok) return;
    expect(restored.code).toBe("conflict");
    expect(await readFile(path.join(w.store, STORE_SKILLS_DIR, "demo", "SKILL.md"), "utf8")).toContain("live");
    expect(await readdir(path.join(w.store, STORE_ARCHIVE_DIR))).toHaveLength(1);
  });

  it("不存在记录 → not-found,不产生任何副作用", async () => {
    const w = await world();
    const res = await archiveSkill(w.store, "nope");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not-found");
    expect(await readdir(path.join(w.store, STORE_ARCHIVE_DIR))).toEqual([]);
  });

  it("链接摘除遇红线(用户占名)→ 整体中止,活跃目录原封不动", async () => {
    const w = await world();
    await makeSkill(w.store, "demo", "---\nname: demo\ndescription: d\n---\npayload");
    const { writeStoreIndex } = await import("./store.js");
    const { upsertLinkEntries } = await import("./links.js");
    await writeStoreIndex(w.store, [{
      dirName: "demo",
      hash: "deadbeef",
      meta: { name: "demo", description: "d" },
      origins: [{ kind: "local-scan", reference: "x" }],
      installedAt: "2026-08-16T00:00:00.000Z",
      visibleIn: ["claude"],
    }]);
    await upsertLinkEntries(w.store, [entry(w, "e1", "demo") as never]);
    // 用户把链接换成了真实目录
    await mkdir(path.join(w.clientRoot, "demo"));
    await writeFile(path.join(w.clientRoot, "demo", "SKILL.md"), "user");
    const res = await archiveSkill(w.store, "demo");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("link-conflict");
    // 活跃目录原封不动,归档区空
    expect(await readdir(path.join(w.store, STORE_SKILLS_DIR))).toEqual(["demo"]);
    expect(await readdir(path.join(w.store, STORE_ARCHIVE_DIR))).toEqual([]);
  });
});
