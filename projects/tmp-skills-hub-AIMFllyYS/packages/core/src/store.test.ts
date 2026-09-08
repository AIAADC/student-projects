import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashSkillFolder } from "./hash.js";
import { adoptMany, adoptSkillFolder, readStoreIndex, writeStoreIndex } from "./store.js";
import { initializeStoreLayout, STORE_SKILLS_DIR, STORE_TMP_DIR } from "./store-layout.js";
import type { SkillSource } from "./types.js";

/**
 * 去重入库内核:内容哈希去重、同名冲突不覆盖、缺字段进报告、index 原子写。
 * 全部用例使用系统临时目录(fake store root),绝不触碰真实目录。
 */

const tempDirs: string[] = [];

async function fakeStore(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-store-kernel-test-"));
  tempDirs.push(dir);
  await initializeStoreLayout(dir);
  return dir;
}

/** 造一个源 skill 文件夹,SKILL.md 带 frontmatter。contentName 决定 SKILL.md 里的 name(与文件夹名可不同)。 */
async function makeSkill(
  parent: string,
  folderName: string,
  contentName: string,
  description: string,
  extra?: string,
): Promise<string> {
  const dir = path.join(parent, folderName);
  await mkdir(dir, { recursive: true });
  let md = "---\nname: " + contentName + "\ndescription: " + description + "\n---\n";
  if (extra !== undefined) md += extra;
  await writeFile(path.join(dir, "SKILL.md"), md);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

const src = (folderPath: string): SkillSource => ({ kind: "local-scan", reference: folderPath });

describe("adoptSkillFolder: 去重与冲突", () => {
  it("首次收录:记录含哈希/元信息/来源/时间,内容复制进 skills/<name>", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "demo-init", "demo-init", "test skill");

    const outcome = await adoptSkillFolder(store, folder, src(folder));
    expect(outcome.kind).toBe("adopted");
    if (outcome.kind !== "adopted") return;
    expect(outcome.record.hash).toBe(await hashSkillFolder(folder));
    expect(outcome.record.dirName).toBe("demo-init");
    expect(outcome.record.meta).toEqual({ name: "demo-init", description: "test skill" });
    expect(outcome.record.origins).toEqual([{ kind: "local-scan", reference: folder }]);
    expect(outcome.record.visibleIn).toEqual([]);
    expect(typeof outcome.record.installedAt).toBe("string");

    // 内容真实复制,源未被移动
    expect(await readFile(path.join(store, STORE_SKILLS_DIR, "demo-init", "SKILL.md"), "utf8")).toBe(
      await readFile(path.join(folder, "SKILL.md"), "utf8"),
    );
    expect(await readFile(path.join(folder, "SKILL.md"), "utf8")).toBeTruthy();
    // 清单落盘
    const index = await readStoreIndex(store);
    expect(index).toHaveLength(1);
    expect(index[0]!.hash).toBe(outcome.record.hash);
  });

  it("同内容第二次收录:幂等,只追加来源,不产生第二份", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "demo-init", "demo-init", "test skill");
    const other = await makeSkill(parent, "copy-dir", "demo-init", "test skill"); // 字节相同,文件夹名不同

    const first = await adoptSkillFolder(store, folder, src(folder));
    expect(first.kind).toBe("adopted");
    const second = await adoptSkillFolder(store, other, src(other));
    expect(second.kind).toBe("duplicate");

    const index = await readStoreIndex(store);
    expect(index).toHaveLength(1); // 只有一份
    expect(index[0]!.origins).toHaveLength(2); // 来源被追加
    // 目录也只有一份
    expect(await readdir(path.join(store, STORE_SKILLS_DIR))).toEqual(["demo-init"]);
  });

  it("同一来源重复收录不重复追加 origins", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "demo-init", "demo-init", "test skill");

    await adoptSkillFolder(store, folder, src(folder));
    const again = await adoptSkillFolder(store, folder, src(folder));
    expect(again.kind).toBe("duplicate");
    expect((await readStoreIndex(store))[0]!.origins).toHaveLength(1);
  });

  it("同名不同内容:冲突,不覆盖,清单与目录保持原样", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const otherParent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src2-"));
    tempDirs.push(otherParent);
    // 同名 demo-init、内容不同 → 冲突;两个来源各占一个父目录,避免互相覆盖
    const folder = await makeSkill(parent, "demo-init", "demo-init", "version A");
    const other = await makeSkill(otherParent, "demo-init", "demo-init", "version B");

    const first = await adoptSkillFolder(store, folder, src(folder));
    expect(first.kind).toBe("adopted");
    const conflict = await adoptSkillFolder(store, other, src(other));
    expect(conflict.kind).toBe("conflict");
    if (conflict.kind !== "conflict") return;
    expect(conflict.existingHash).toBe((await readStoreIndex(store))[0]!.hash);
    expect(conflict.incomingHash).toBe(await hashSkillFolder(other));

    // 原内容未被覆盖
    expect(await readFile(path.join(store, STORE_SKILLS_DIR, "demo-init", "SKILL.md"), "utf8")).toBe(
      await readFile(path.join(folder, "SKILL.md"), "utf8"),
    );
    expect(await readStoreIndex(store)).toHaveLength(1);
  });

  it("skills/<name> 目录已存在但清单无记录:冲突,绝不覆盖", async () => {
    const store = await fakeStore();
    await mkdir(path.join(store, STORE_SKILLS_DIR, "manual"), { recursive: true });
    await writeFile(path.join(store, STORE_SKILLS_DIR, "manual", "SKILL.md"), "user file");
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "manual", "manual", "someone");

    const outcome = await adoptSkillFolder(store, folder, src(folder));
    expect(outcome.kind).toBe("conflict");
    expect(await readFile(path.join(store, STORE_SKILLS_DIR, "manual", "SKILL.md"), "utf8")).toBe("user file");
  });

  it("dryRun:adopted 只报告不落盘", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "demo-dry", "demo-dry", "dry test");

    const outcome = await adoptSkillFolder(store, folder, src(folder), { dryRun: true });
    expect(outcome.kind).toBe("adopted");
    // 目录未复制、清单未写入、tmp 无残留
    expect(await readdir(path.join(store, STORE_SKILLS_DIR))).toEqual([]);
    expect(await readStoreIndex(store)).toEqual([]);
    const tmpFiles = await readdir(path.join(store, STORE_TMP_DIR));
    expect(tmpFiles).toEqual([]);
  });

  it("dryRun:duplicate 不追加来源", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const folder = await makeSkill(parent, "demo-dry", "demo-dry", "dry test");
    const other = await makeSkill(parent, "copy-dir", "demo-dry", "dry test");

    await adoptSkillFolder(store, folder, src(folder));
    const dup = await adoptSkillFolder(store, other, src(other), { dryRun: true });
    expect(dup.kind).toBe("duplicate");
    expect((await readStoreIndex(store))[0]!.origins).toHaveLength(1);
  });
});

describe("adoptSkillFolder: 缺字段与报告", () => {
  it("缺 name/description 的目录:invalid 进报告,不入库", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const noName = await makeSkill(parent, "bad-1", "bad-1", ""); // description 为空
    const noMd = path.join(parent, "bad-2");
    await mkdir(noMd); // 无 SKILL.md

    const report = await adoptMany(store, [
      { folderPath: noName, origin: src(noName) },
      { folderPath: noMd, origin: src(noMd) },
    ]);
    expect(report.invalid).toBe(2);
    expect(report.adopted).toBe(0);
    expect(report.outcomes.every((o) => o.kind === "invalid")).toBe(true);
    expect(await readStoreIndex(store)).toEqual([]);
    expect(await readdir(path.join(store, STORE_SKILLS_DIR))).toEqual([]);
  });

  it("adoptMany 汇总计数", async () => {
    const store = await fakeStore();
    const parent = await mkdtemp(path.join(os.tmpdir(), "skills-hub-src-"));
    tempDirs.push(parent);
    const a = await makeSkill(parent, "aaa", "aaa", "one");
    const b = await makeSkill(parent, "bbb", "bbb", "two");
    const bad = await makeSkill(parent, "ccc", "ccc", "");

    const report = await adoptMany(store, [
      { folderPath: a, origin: src(a) },
      { folderPath: b, origin: src(b) },
      { folderPath: bad, origin: src(bad) },
    ]);
    expect(report.adopted).toBe(2);
    expect(report.invalid).toBe(1);
    expect(report.conflicts).toBe(0);
    expect(report.outcomes).toHaveLength(3);
  });
});

describe("readStoreIndex / writeStoreIndex", () => {
  it("空库(无文件或 init 占位 {})返回空数组", async () => {
    const store = await fakeStore();
    expect(await readStoreIndex(store)).toEqual([]);

    const bare = await mkdtemp(path.join(os.tmpdir(), "skills-hub-bare-"));
    tempDirs.push(bare);
    expect(await readStoreIndex(bare)).toEqual([]); // 无 index.json
  });

  it("写盘原子化:内容合法且 tmp 目录无残留", async () => {
    const store = await fakeStore();
    await writeStoreIndex(store, []);
    const raw = JSON.parse(await readFile(path.join(store, "index.json"), "utf8"));
    expect(raw.version).toBe(2);
    expect(raw.skills).toEqual([]);
    expect(await readdir(path.join(store, STORE_TMP_DIR))).toEqual([]);
  });

  it("index.json 损坏:抛错而不是静默重置", async () => {
    const store = await fakeStore();
    await writeFile(path.join(store, "index.json"), "{broken");
    await expect(readStoreIndex(store)).rejects.toThrow(/无法解析/);
    // 版本不支持
    await writeFile(path.join(store, "index.json"), JSON.stringify({ version: 99, skills: [] }));
    await expect(readStoreIndex(store)).rejects.toThrow(/版本过高/);
  });
});
