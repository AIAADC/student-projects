import { mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLinkTarget } from "./link-probe.js";
import * as coreBarrel from "./index.js";
import {
  attachVisibleIn,
  checkLinksLedger,
  LINKS_LEDGER_VERSION,
  queryLinksByClient,
  readLinksLedger,
  removeLinkEntries,
  upsertLinkEntries,
  visibleInFromLedger,
  writeLinksLedger,
  type LinkEntry,
} from "./links.js";
import { STORE_SKILLS_DIR } from "./store-layout.js";

/**
 * 受管链接台账(#20):读/写原子性、按客户端查询、与磁盘对账。
 * 全部在系统临时目录下进行。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-links-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

function entry(over: Partial<LinkEntry> = {}): LinkEntry {
  return {
    id: "link-1",
    clientId: "claude",
    scope: "skills",
    targetDir: "C:\\fake\\home\\.claude\\skills",
    entryName: "demo",
    skillHash: "abc",
    kind: "junction",
    createdAt: "2026-08-16T00:00:00.000Z",
    ...over,
  };
}

describe("links 台账读写", () => {
  it("缺失文件 → 空台账;写入后读回一致,版本正确", async () => {
    const store = await tmp();
    expect(await readLinksLedger(store)).toEqual([]);
    const entries = [entry(), entry({ id: "link-2", clientId: "cursor", entryName: "other" })];
    await writeLinksLedger(store, entries);
    const back = await readLinksLedger(store);
    expect(back).toEqual(entries);
    expect(JSON.parse(await readFile(path.join(store, "links.json"), "utf8")).version).toBe(LINKS_LEDGER_VERSION);
  });

  it("原子写:先 tmp 再 rename,完成后无 tmp 残留", async () => {
    const store = await tmp();
    await writeLinksLedger(store, [entry()]);
    expect((await readdir(store)).filter((f) => f.endsWith(".tmp"))).toEqual([]);
    expect((await readdir(store)).includes("links.json")).toBe(true);
  });

  it("init 占位 {} → 空台账;损坏/版本不符 → 抛错不重置", async () => {
    const store = await tmp();
    await writeFile(path.join(store, "links.json"), "{}");
    expect(await readLinksLedger(store)).toEqual([]);
    await writeFile(path.join(store, "links.json"), "{ not json");
    await expect(readLinksLedger(store)).rejects.toThrow();
    // 损坏后文件未被改写(不重置)
    expect(await readFile(path.join(store, "links.json"), "utf8")).toBe("{ not json");
    await writeFile(path.join(store, "links.json"), JSON.stringify({ version: 99, entries: [] }));
    await expect(readLinksLedger(store)).rejects.toThrow(/版本/);
  });

  it("upsert 按 id 去重,remove 按 id 删除,均原子落盘", async () => {
    const store = await tmp();
    await upsertLinkEntries(store, [entry()]);
    await upsertLinkEntries(store, [entry({ id: "link-2", clientId: "cursor" })]);
    await upsertLinkEntries(store, [entry({ createdAt: "2026-08-16T01:00:00.000Z" })]); // 同 id 更新
    let entries = await readLinksLedger(store);
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === "link-1")!.createdAt).toBe("2026-08-16T01:00:00.000Z");
    entries = await removeLinkEntries(store, ["link-1"]);
    expect(entries).toHaveLength(1);
    expect((await readLinksLedger(store))[0]!.id).toBe("link-2");
  });

  it("visibleIn 由台账推导,与 index 缓存无关", () => {
    const ledger = [entry(), entry({ id: "l2", clientId: "cursor" }), entry({ id: "l3", clientId: "claude", entryName: "other" })];
    expect(visibleInFromLedger("demo", ledger)).toEqual(["claude", "cursor"]);
    expect(visibleInFromLedger("other", ledger)).toEqual(["claude"]);
    expect(visibleInFromLedger("nope", ledger)).toEqual([]);
    const skills = [
      {
        hash: "h",
        dirName: "demo",
        meta: { name: "demo", description: "d" },
        origins: [],
        visibleIn: ["stale"],
        installedAt: "t",
      },
    ];
    expect(attachVisibleIn(skills, ledger)[0]!.visibleIn).toEqual(["claude", "cursor"]);
    expect(skills[0]!.visibleIn).toEqual(["stale"]);
  });

  it("包入口不导出只改台账的 upsert/remove", () => {
    expect("upsertLinkEntries" in coreBarrel).toBe(false);
    expect("removeLinkEntries" in coreBarrel).toBe(false);
    expect("applyLinkSet" in coreBarrel).toBe(true);
    expect("attachVisibleIn" in coreBarrel).toBe(true);
  });

  it("queryLinksByClient:按客户端过滤,可叠加范围", async () => {
    const entries = [
      entry(),
      entry({ id: "l2", clientId: "claude", scope: "skills-v2" }),
      entry({ id: "l3", clientId: "cursor" }),
    ];
    expect(queryLinksByClient(entries, "claude")).toHaveLength(2);
    expect(queryLinksByClient(entries, "claude", "skills")).toHaveLength(1);
    expect(queryLinksByClient(entries, "cursor")).toHaveLength(1);
    expect(queryLinksByClient(entries, "gemini")).toHaveLength(0);
  });
});

describe("links 台账与磁盘对账", () => {
  it.runIf(process.platform === "win32")("ok / 外部删除→missing / 用户占名→not-link / store 目标消失→target-invalid", async () => {
    const work = await tmp();
    const store = path.join(work, "store");
    await mkdir(path.join(store, STORE_SKILLS_DIR, "demo"), { recursive: true });
    await writeFile(path.join(store, STORE_SKILLS_DIR, "demo", "SKILL.md"), "x");
    const clientRoot = path.join(work, "home", ".claude", "skills");
    await mkdir(clientRoot, { recursive: true });
    const storeSkill = path.join(store, STORE_SKILLS_DIR, "demo");
    const linkPath = path.join(clientRoot, "demo");
    await symlink(storeSkill, linkPath, "junction");

    const base = { clientId: "claude", scope: "skills", targetDir: clientRoot, entryName: "demo", skillHash: "h", kind: "junction" as const, createdAt: "t" };
    const checks1 = await checkLinksLedger(store, [{ ...base, id: "e1" }]);
    expect(checks1[0]!.state).toBe("ok");

    // 外部删除链接 → missing
    await unlink(linkPath);
    const checks2 = await checkLinksLedger(store, [{ ...base, id: "e1" }]);
    expect(checks2[0]!.state).toBe("missing");

    // 用户用自己的文件夹占名 → not-link(绝不触碰)
    await mkdir(linkPath);
    const checks3 = await checkLinksLedger(store, [{ ...base, id: "e1" }]);
    expect(checks3[0]!.state).toBe("not-link");

    // store 目标消失 → target-invalid(链接还在,指向没了)
    await rm(linkPath, { recursive: true });
    await rm(path.join(store, STORE_SKILLS_DIR, "demo"), { recursive: true });
    await symlink(storeSkill, linkPath, "junction");
    const checks4 = await checkLinksLedger(store, [{ ...base, id: "e1" }]);
    expect(checks4[0]!.state).toBe("target-invalid");
  });

  it("readLinkTarget:普通目录/文件返回 null,链接返回解析目标", async () => {
    const work = await tmp();
    await mkdir(path.join(work, "plain"), { recursive: true });
    await writeFile(path.join(work, "file.txt"), "x");
    expect(await readLinkTarget(path.join(work, "plain"))).toBeNull();
    expect(await readLinkTarget(path.join(work, "file.txt"))).toBeNull();
    expect(await readLinkTarget(path.join(work, "nope"))).toBeNull();
    if (process.platform !== "win32") {
      await symlink(path.join(work, "plain"), path.join(work, "ln"), "dir");
      expect(await readLinkTarget(path.join(work, "ln"))).toBe(path.join(work, "plain"));
    }
  });
});
