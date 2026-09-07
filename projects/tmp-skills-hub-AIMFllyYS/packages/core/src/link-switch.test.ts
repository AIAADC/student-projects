import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyLinkSet, type LinkSetPlan } from "./link-switch.js";
import { readLinksLedger } from "./links.js";
import { STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";

/**
 * 链接集合原子切换与失败回滚(#21)。
 * 全部在沙箱假 home 下进行;真实客户端目录零写入。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-switch-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});



async function makeSkill(store: string, name: string, content: string): Promise<void> {
  await mkdir(path.join(store, STORE_SKILLS_DIR, name), { recursive: true });
  await writeFile(path.join(store, STORE_SKILLS_DIR, name, "SKILL.md"), content);
}

interface World {
  store: string;
  clientRoot: string;
}

async function world(): Promise<World> {
  const work = await tmp();
  const store = path.join(work, "store");
  await mkdir(path.join(store, STORE_SKILLS_DIR), { recursive: true });
  await mkdir(path.join(store, STORE_TMP_DIR), { recursive: true });
  const clientRoot = path.join(work, "home", ".claude", "skills");
  await mkdir(clientRoot, { recursive: true });
  // 用户自己的真实文件,任何操作后都必须原样保留
  await writeFile(path.join(clientRoot, "user-own.md"), "user data");
  return { store, clientRoot };
}

function entry(w: World, id: string, name: string, extra: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    id,
    clientId: "claude",
    scope: "skills",
    targetDir: w.clientRoot,
    entryName: name,
    skillHash: "h-" + name,
    kind: "junction",
    createdAt: "2026-08-16T00:00:00.000Z",
    ...extra,
  };
}

const USER_FILE = "user data";

describe("链接集合原子切换(#21)", () => {
  it("成功:建链接→读穿→台账更新→tmp 清理,用户文件原样", async () => {
    const w = await world();
    await makeSkill(w.store, "alpha", "A");
    await makeSkill(w.store, "beta", "B");
    const plan: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "alpha"), entry(w, "e2", "beta")] as never };
    const res = await applyLinkSet(w.store, plan);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await readFile(path.join(w.clientRoot, "alpha", "SKILL.md"), "utf8")).toBe("A");
    expect(await readFile(path.join(w.clientRoot, "beta", "SKILL.md"), "utf8")).toBe("B");
    expect((await readLinksLedger(w.store)).map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    // tmp 清理:成功路径无残留(目录可能已被删除)
    expect(await readdir(path.join(w.store, STORE_TMP_DIR)).catch(() => [])).toEqual([]);
    // 用户文件原样
    expect(await readFile(path.join(w.clientRoot, "user-own.md"), "utf8")).toBe(USER_FILE);
  });

  it("红线:落点存在但台账未登记 → 报错中止,绝不覆盖", async () => {
    const w = await world();
    await makeSkill(w.store, "demo", "D");
    // 用户自己的同名真实目录
    await mkdir(path.join(w.clientRoot, "demo"));
    await writeFile(path.join(w.clientRoot, "demo", "SKILL.md"), "user version");
    const plan: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "demo")] as never };
    const res = await applyLinkSet(w.store, plan);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("unregistered-conflict");
    // 用户目录原封不动
    expect(await readFile(path.join(w.clientRoot, "demo", "SKILL.md"), "utf8")).toBe("user version");
    expect((await readLinksLedger(w.store))).toEqual([]);
  });

  it("红线:台账条目落点被用户换成真实目录 → 摘除中止,目录原样", async () => {
    const w = await world();
    await makeSkill(w.store, "alpha", "A");
    // 先正常建链
    const plan1: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "alpha")] as never };
    expect((await applyLinkSet(w.store, plan1)).ok).toBe(true);
    // 用户把链接换成了自己的真实目录
    await rm(path.join(w.clientRoot, "alpha"), { recursive: true });
    await mkdir(path.join(w.clientRoot, "alpha"));
    await writeFile(path.join(w.clientRoot, "alpha", "SKILL.md"), "user alpha");
    // 摘除计划(空集合)
    const res = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [] });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("not-link-conflict");
    expect(await readFile(path.join(w.clientRoot, "alpha", "SKILL.md"), "utf8")).toBe("user alpha");
    expect((await readLinksLedger(w.store)).map((e) => e.id)).toEqual(["e1"]);
  });

  it("失败回滚(failAfter=0):一步未动,与变更前一致", async () => {
    const w = await world();
    await makeSkill(w.store, "alpha", "A");
    const res = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [entry(w, "e1", "alpha")] as never }, { failAfter: 0 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("io-error");
    expect(await readdir(w.clientRoot).then((d) => d.sort())).toEqual(["user-own.md"]);
    expect(await readLinksLedger(w.store)).toEqual([]);
    expect(await readdir(path.join(w.store, STORE_TMP_DIR))).toEqual([]);
  });

  it("失败回滚(failAfter=1):摘除一半后注入失败,旧链接全部恢复", async () => {
    const w = await world();
    await makeSkill(w.store, "alpha", "A");
    await makeSkill(w.store, "beta", "B");
    const plan1: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "alpha"), entry(w, "e2", "beta")] as never };
    expect((await applyLinkSet(w.store, plan1)).ok).toBe(true);
    // 摘除两个 + 新建一个,在第 1 步后注入失败
    await makeSkill(w.store, "gamma", "G");
    const res = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [entry(w, "e3", "gamma")] as never }, { failAfter: 1 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // 状态回到变更前:alpha/beta 链接都在,gamma 不存在,台账未变
    expect(await readFile(path.join(w.clientRoot, "alpha", "SKILL.md"), "utf8")).toBe("A");
    expect(await readFile(path.join(w.clientRoot, "beta", "SKILL.md"), "utf8")).toBe("B");
    expect(await readdir(w.clientRoot).then((d) => d.includes("gamma"))).toBe(false);
    expect((await readLinksLedger(w.store)).map((e) => e.id).sort()).toEqual(["e1", "e2"]);
    expect(await readdir(path.join(w.store, STORE_TMP_DIR))).toEqual([]);
  });

  it("失败回滚(failAfter=2):新建一半后注入失败,新建摘除、旧链接恢复", async () => {
    const w = await world();
    await makeSkill(w.store, "old", "O");
    const plan1: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "old")] as never };
    expect((await applyLinkSet(w.store, plan1)).ok).toBe(true);
    // 摘除 old(1 步)+ 新建 a(1 步)+ 新建 b(1 步),第 2 步后注入失败 → 已建 a,未建 b
    await makeSkill(w.store, "a", "AA");
    await makeSkill(w.store, "b", "BB");
    const res = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [entry(w, "e2", "a"), entry(w, "e3", "b")] as never }, { failAfter: 2 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // old 恢复,a/b 都不存在
    expect(await readFile(path.join(w.clientRoot, "old", "SKILL.md"), "utf8")).toBe("O");
    expect(await readdir(w.clientRoot).then((d) => d.includes("a"))).toBe(false);
    expect(await readdir(w.clientRoot).then((d) => d.includes("b"))).toBe(false);
    expect((await readLinksLedger(w.store)).map((e) => e.id)).toEqual(["e1"]);
  });

  it("更新场景:同 entryName 换新条目,成功路径旧链摘除、新链生效、台账换 id", async () => {
    const w = await world();
    await makeSkill(w.store, "alpha", "V1");
    const plan1: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e-old", "alpha")] as never };
    expect((await applyLinkSet(w.store, plan1)).ok).toBe(true);
    // 内容升级:同一 store 目录改内容(新哈希),台账换新 id
    await writeFile(path.join(w.store, STORE_SKILLS_DIR, "alpha", "SKILL.md"), "V2");
    const plan2: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e-new", "alpha")] as never };
    const res = await applyLinkSet(w.store, plan2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await readFile(path.join(w.clientRoot, "alpha", "SKILL.md"), "utf8")).toBe("V2");
    expect((await readLinksLedger(w.store)).map((e) => e.id)).toEqual(["e-new"]);
  });

  it("kind=copy:复制目录落盘,内容一致;成功后台账登记 copy 条目", async () => {
    const w = await world();
    await makeSkill(w.store, "copy-skill", "C");
    const e = entry(w, "e1", "copy-skill", { kind: "copy" });
    const res = await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [e] as never });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await readFile(path.join(w.clientRoot, "copy-skill", "SKILL.md"), "utf8")).toBe("C");
    expect((await readLinksLedger(w.store))[0]!.kind).toBe("copy");
  });

  it("整目录安全:全程不 rename/删除客户端目录本身(静态断言:操作只发生在条目路径)", async () => {
    // 本测试验证客户端根目录始终存在、目录内用户文件始终原样
    const w = await world();
    await makeSkill(w.store, "alpha", "A");
    const plan: LinkSetPlan = { targetDir: w.clientRoot, entries: [entry(w, "e1", "alpha")] as never };
    const res = await applyLinkSet(w.store, plan);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(await readdir(w.clientRoot).then((d) => d.includes("user-own.md"))).toBe(true);
    expect(await readFile(path.join(w.clientRoot, "user-own.md"), "utf8")).toBe(USER_FILE);
    // 摘除后依然
    await applyLinkSet(w.store, { targetDir: w.clientRoot, entries: [] });
    expect(await readdir(w.clientRoot).then((d) => d.includes("user-own.md"))).toBe(true);
    expect(await readFile(path.join(w.clientRoot, "user-own.md"), "utf8")).toBe(USER_FILE);
  });
});
