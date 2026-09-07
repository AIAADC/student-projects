import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashSkillFolder } from "./hash.js";

/**
 * hashSkillFolder 的三条确定性不变量(docs/conventions/core-patterns.md 第三节):
 * 文件顺序无关、相对路径参与哈希、不做换行归一化。
 * 临时目录一律建在系统临时目录下,不碰真实客户端目录。
 */

const tempDirs: string[] = [];

/** 建一个内容固定的临时 skill 目录;键为相对路径,值为原始字节内容。 */
async function makeSkillDir(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-hash-test-"));
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

describe("hashSkillFolder", () => {
  it("文件顺序无关:内容相同、写入顺序不同,哈希相同", async () => {
    const a = await makeSkillDir({ "a.txt": "A", "b.txt": "B", "c.txt": "C" });
    const b = await makeSkillDir({ "c.txt": "C", "a.txt": "A", "b.txt": "B" });
    await expect(hashSkillFolder(a)).resolves.toBe(await hashSkillFolder(b));
  });

  it("相对路径参与哈希:同内容不同文件名,哈希不同", async () => {
    const a = await makeSkillDir({ "x.txt": "hello" });
    const b = await makeSkillDir({ "y.txt": "hello" });
    expect(await hashSkillFolder(a)).not.toBe(await hashSkillFolder(b));
  });

  it("目录层级参与哈希:同内容同文件名不同层级,哈希不同", async () => {
    const a = await makeSkillDir({ "x.txt": "hello" });
    const b = await makeSkillDir({ "sub/x.txt": "hello" });
    expect(await hashSkillFolder(a)).not.toBe(await hashSkillFolder(b));
  });

  it("不做换行归一化:LF 与 CRLF 内容哈希不同", async () => {
    const lf = await makeSkillDir({ "SKILL.md": "line1\nline2\n" });
    const crlf = await makeSkillDir({ "SKILL.md": "line1\r\nline2\r\n" });
    expect(await hashSkillFolder(lf)).not.toBe(await hashSkillFolder(crlf));
  });

  it("忽略清单内的条目不参与哈希", async () => {
    const clean = await makeSkillDir({ "SKILL.md": "hi" });
    const dirty = await makeSkillDir({
      "SKILL.md": "hi",
      ".git/config": "junk",
      "node_modules/pkg/index.js": "junk",
      ".DS_Store": "junk",
      "Thumbs.db": "junk",
    });
    expect(await hashSkillFolder(dirty)).toBe(await hashSkillFolder(clean));
  });

  it("空目录哈希为 sha256(空输入),作为确定性基线", async () => {
    const dir = await makeSkillDir({});
    // sha256 空输入的标准值,钉死以防未来误改哈希构造
    const emptySha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(await hashSkillFolder(dir)).toBe(emptySha256);
  });
});
