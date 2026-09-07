import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashSkillFolder } from "./hash.js";
import { zipDirectory, zipEntries } from "./zip.js";

const tempDirs: string[] = [];

async function makeSkillDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-ignore-test-"));
  tempDirs.push(dir);
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relPath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("skill 忽略清单(hash 与 zip 同一份)", () => {
  it("含 node_modules/.DS_Store 的目录哈希与干净目录相同,且 zip 不含这些名字", async () => {
    const clean = await makeSkillDir({ "SKILL.md": "hi", "notes.md": "n" });
    const dirty = await makeSkillDir({
      "SKILL.md": "hi",
      "notes.md": "n",
      ".git/config": "junk",
      "node_modules/pkg/index.js": "junk",
      ".DS_Store": "junk",
      "Thumbs.db": "junk",
    });
    expect(await hashSkillFolder(dirty)).toBe(await hashSkillFolder(clean));

    const names = [...(await zipEntries(await zipDirectory(dirty))).keys()].sort();
    expect(names).toEqual(["SKILL.md", "notes.md"]);
    expect(names.some((n) => n === ".DS_Store" || n === "Thumbs.db" || n.split("/").includes("node_modules") || n.split("/").includes(".git"))).toBe(
      false,
    );
  });
});
