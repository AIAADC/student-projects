import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSkillMeta, readSkillMeta } from "./skill-md.js";

/** parseSkillMeta 的最低收录要求:name + description 缺一不可。 */

describe("parseSkillMeta", () => {
  it("正常 frontmatter:解析出 name 与 description", () => {
    const markdown = [
      "---",
      "name: demo-init",
      "description: Initialize a Next.js project with EdgeOne Pages deployment",
      "---",
      "# Demo Init",
    ].join("\n");
    expect(parseSkillMeta(markdown)).toEqual({
      name: "demo-init",
      description: "Initialize a Next.js project with EdgeOne Pages deployment",
    });
  });

  it("缺 name 返回 null", () => {
    const markdown = ["---", "description: no name here", "---", "body"].join("\n");
    expect(parseSkillMeta(markdown)).toBeNull();
  });

  it("缺 description 返回 null", () => {
    const markdown = ["---", "name: no-desc", "---", "body"].join("\n");
    expect(parseSkillMeta(markdown)).toBeNull();
  });

  it("无 frontmatter 返回 null", () => {
    expect(parseSkillMeta("# Just a heading")).toBeNull();
  });

  it("带引号的值会被去引号", () => {
    const markdown = ["---", 'name: "quoted name"', 'description: "quoted desc"', "---"].join("\n");
    expect(parseSkillMeta(markdown)).toEqual({ name: "quoted name", description: "quoted desc" });
  });

  it("CRLF 换行的 frontmatter 同样可解析", () => {
    const markdown = "---\r\nname: crlf-skill\r\ndescription: crlf desc\r\n---\r\nbody";
    expect(parseSkillMeta(markdown)).toEqual({ name: "crlf-skill", description: "crlf desc" });
  });

  it("UTF-8 BOM 开头的文件(Windows 记事本)同样可解析", () => {
    const markdown = "\uFEFF---\nname: bom-skill\ndescription: bom desc\n---\nbody";
    expect(parseSkillMeta(markdown)).toEqual({ name: "bom-skill", description: "bom desc" });
  });

  it("值为空视为缺失,返回 null", () => {
    const markdown = ["---", "name: ", "description: has desc", "---"].join("\n");
    expect(parseSkillMeta(markdown)).toBeNull();
  });
});

describe("readSkillMeta", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeSkillDir(files: Record<string, string>): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-md-test-"));
    tempDirs.push(dir);
    for (const [name, content] of Object.entries(files)) {
      await writeFile(path.join(dir, name), content);
    }
    return dir;
  }

  it("SKILL.md 正常时返回解析结果", async () => {
    const dir = await makeSkillDir({ "SKILL.md": "---\nname: demo-init\ndescription: demo\n---\nbody" });
    await expect(readSkillMeta(dir)).resolves.toEqual({ name: "demo-init", description: "demo" });
  });

  it("目录缺 SKILL.md 返回 null", async () => {
    const dir = await makeSkillDir({ "README.md": "no skill here" });
    await expect(readSkillMeta(dir)).resolves.toBeNull();
  });
});
