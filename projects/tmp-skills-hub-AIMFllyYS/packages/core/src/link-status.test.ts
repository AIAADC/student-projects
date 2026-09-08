import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { classifyClientLink, findDanglingLinks } from "./link-status.js";
import { rm } from "node:fs/promises";

const trash: string[] = [];

afterEach(async () => {
  await Promise.all(trash.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function tmp(): Promise<string> {
  const dir = path.join(os.tmpdir(), "skills-hub-link-status-" + Date.now() + "-" + Math.random().toString(16).slice(2));
  await mkdir(dir, { recursive: true });
  trash.push(dir);
  return dir;
}

describe("classifyClientLink", () => {
  it("无落点且无台账 → off", async () => {
    const dir = await tmp();
    const r = await classifyClientLink(path.join(dir, "missing"), false);
    expect(r.state).toBe("off");
  });

  it("无落点但台账有 → dangling", async () => {
    const dir = await tmp();
    const r = await classifyClientLink(path.join(dir, "missing"), true);
    expect(r.state).toBe("dangling");
  });

  it("用户文件夹占名 → unregistered-conflict(无论是否在台账)", async () => {
    const dir = await tmp();
    const dest = path.join(dir, "demo");
    await mkdir(dest);
    await writeFile(path.join(dest, "SKILL.md"), "x", "utf8");
    expect((await classifyClientLink(dest, false)).state).toBe("unregistered-conflict");
    expect((await classifyClientLink(dest, true)).state).toBe("unregistered-conflict");
  });

  it("受管链接且目标在 → managed", async () => {
    const dir = await tmp();
    const target = path.join(dir, "real");
    await mkdir(target);
    const dest = path.join(dir, "demo");
    await symlink(target, dest, "junction");
    const r = await classifyClientLink(dest, true);
    expect(r.state).toBe("managed");
  });

  it("活链但不在台账 → unregistered-conflict", async () => {
    const dir = await tmp();
    const target = path.join(dir, "real");
    await mkdir(target);
    const dest = path.join(dir, "demo");
    await symlink(target, dest, "junction");
    expect((await classifyClientLink(dest, false)).state).toBe("unregistered-conflict");
  });
});

describe("findDanglingLinks 与 classifyClientLink 同一套判定", () => {
  it("目标存在的链接不算悬空,目标缺失的算", async () => {
    const work = await tmp();
    const store = path.join(work, "store");
    await mkdir(store, { recursive: true });
    const root = path.join(work, "root");
    await mkdir(root, { recursive: true });
    await symlink(store, path.join(root, "good"), "junction");
    await symlink(path.join(work, "missing-target"), path.join(root, "dangling"), "junction");

    const result = await findDanglingLinks([root]);
    expect(result).toHaveLength(1);
    expect(result[0]!.linkPath).toContain("dangling");
    expect(result[0]!.target).toContain("missing-target");
    expect((await classifyClientLink(path.join(root, "dangling"), false)).state).toBe("dangling");
    expect((await classifyClientLink(path.join(root, "good"), true)).state).toBe("managed");
  });

  it("用户文件夹占名不报悬空", async () => {
    const work = await tmp();
    const root = path.join(work, "root");
    await mkdir(path.join(root, "plain-dir"), { recursive: true });
    await writeFile(path.join(root, "plain-file.txt"), "x");
    expect(await findDanglingLinks([root])).toEqual([]);
    expect((await classifyClientLink(path.join(root, "plain-dir"), false)).state).toBe("unregistered-conflict");
  });

  it("台账有记录但落点缺失 → dangling;用户占名即使在台账也不进悬空列表", async () => {
    const work = await tmp();
    const root = path.join(work, "root");
    await mkdir(root, { recursive: true });
    const occupied = path.join(root, "occupied");
    await mkdir(occupied);
    const missing = path.join(root, "ghost");
    const result = await findDanglingLinks([root], [
      { targetDir: root, entryName: "ghost" },
      { targetDir: root, entryName: "occupied" },
    ]);
    expect(result.map((d) => path.basename(d.linkPath))).toEqual(["ghost"]);
    expect(result[0]!.linkPath).toBe(path.resolve(missing));
    expect((await classifyClientLink(missing, true)).state).toBe("dangling");
    expect((await classifyClientLink(occupied, true)).state).toBe("unregistered-conflict");
  });
});
