import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readStoreIndex, writeStoreIndex } from "./store.js";
import { listSkillFiles, readSkillFile, saveSkillFile } from "./skill-files.js";
import type { SkillRecord } from "./types.js";

const roots: string[] = [];
afterAll(async () => {
  await Promise.all(roots.map((d) => rm(d, { recursive: true, force: true })));
});

async function makeSkill(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-"));
  roots.push(dir);
  await writeFile(path.join(dir, "SKILL.md"), "# demo\n\nbody\n", "utf8");
  await mkdir(path.join(dir, "references"));
  await writeFile(path.join(dir, "references", "guide.md"), "guide\n", "utf8");
  await mkdir(path.join(dir, "scripts"));
  await writeFile(path.join(dir, "scripts", "run.ps1"), "echo hi\n", "utf8");
  return dir;
}

async function makeStore(): Promise<{ root: string; skillDir: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "skills-hub-save-"));
  roots.push(root);
  const skillDir = path.join(root, "skills", "demo");
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, "SKILL.md"), "# old\n", "utf8");
  const record: SkillRecord = {
    hash: "old-hash",
    dirName: "demo",
    meta: { name: "demo", description: "demo" },
    origins: [],
    visibleIn: [],
    installedAt: "2026-08-16T00:00:00.000Z",
  };
  await writeStoreIndex(root, [record]);
  return { root, skillDir };
}

describe("skill-files 读取", () => {
  it("文件树:目录在前、POSIX 路径、按路径排序", async () => {
    const dir = await makeSkill();
    const res = await listSkillFiles(dir);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const paths = res.entries.map((e) => e.path);
    expect(paths).toContain("SKILL.md");
    expect(paths).toContain("references");
    expect(paths).toContain("references/guide.md");
    expect(paths).toContain("scripts/run.ps1");
    expect(res.entries[0]?.kind).toBe("dir");
  });

  it("读取文本文件内容", async () => {
    const dir = await makeSkill();
    const res = await readSkillFile(dir, "SKILL.md");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.content).toContain("# demo");
  });

  it("路径穿越被拒绝(outside)", async () => {
    const dir = await makeSkill();
    // path.join 生成平台各自的分隔符:Windows \\,POSIX /
    const res = await readSkillFile(dir, path.join("..", "..", "secret.txt"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("outside");
  });

  it("不存在 → not-found", async () => {
    const dir = await makeSkill();
    const res = await readSkillFile(dir, "nope.md");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not-found");
  });

  it("二进制(含 NUL)→ binary 降级", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-bin-"));
    roots.push(dir);
    await writeFile(path.join(dir, "blob.bin"), Buffer.from([0x00, 0x01, 0x02]));
    const res = await readSkillFile(dir, "blob.bin");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("binary");
  });

  it("大文件 → too-large 降级", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-files-big-"));
    roots.push(dir);
    await writeFile(path.join(dir, "big.md"), "x".repeat(600 * 1024), "utf8");
    const res = await readSkillFile(dir, "big.md");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("too-large");
  });
});

describe("saveSkillFile", () => {
  it("保存:改动落到原件,哈希更新,旧内容进版本归档", async () => {
    const { root, skillDir } = await makeStore();
    const res = await saveSkillFile({ storeRoot: root, skillDir, relPath: "SKILL.md", content: "# new\n" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 原件已是新内容
    expect(await readFile(path.join(skillDir, "SKILL.md"), "utf8")).toBe("# new\n");
    // 索引哈希已更新(非静默失真)
    const skills = await readStoreIndex(root);
    expect(skills[0]?.hash).toBe(res.newHash);
    expect(skills[0]?.hash).not.toBe("old-hash");
    // 旧内容可追溯(archive/versions/<name>-<stamp>/SKILL.md)
    const versionsDir = path.join(root, "archive", "versions");
    const stamps = await readdir(versionsDir);
    expect(stamps.length).toBe(1);
    const old = await readFile(path.join(versionsDir, stamps[0] ?? "", "SKILL.md"), "utf8");
    expect(old).toBe("# old\n");
  });

  it("路径穿越被拒绝(outside),不写任何东西", async () => {
    const { root, skillDir } = await makeStore();
    const res = await saveSkillFile({ storeRoot: root, skillDir, relPath: path.join("..", "..", "x.md"), content: "hi" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("outside");
    const versionsDir = path.join(root, "archive", "versions");
    await expect(readdir(versionsDir)).rejects.toThrow();
  });

  it("内容超限 → too-large,不写", async () => {
    const { root, skillDir } = await makeStore();
    const res = await saveSkillFile({ storeRoot: root, skillDir, relPath: "SKILL.md", content: "x".repeat(600 * 1024) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("too-large");
  });
});
