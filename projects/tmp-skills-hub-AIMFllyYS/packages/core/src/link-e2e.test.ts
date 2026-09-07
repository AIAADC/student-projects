import { mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adoptSkillFolder, initializeStoreLayout, probeLinkTypes, STORE_SKILLS_DIR } from "./index.js";

/**
 * 沙箱端到端验证:链接能被「客户端读取路径」读穿(#24)。
 *
 * 产品前提:把 skill 以链接形式放进客户端 skills 目录,客户端照常发现和使用。
 * 本测试在假 home(系统临时目录)下模拟客户端读取路径:readdir + readFile
 * 走的就是真实客户端加载器用的同一组文件系统 API(glob/递归遍历)。
 *
 * 本机结论(2026-08-16,doctor 探测):junction 可用(无需提权)、symlink 不可用
 * (未开开发者模式)、hardlink 仅文件。Windows 用例跑 junction,非 Windows 跑 symlink。
 * 真实 agent 二进制的加载行为需 spike 实测(见链接语义调研文档),
 * 文件系统语义层以本测试为准。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-link-e2e-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function makeSkill(dir: string, name: string, content: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), content);
  return dir;
}

/** 建链 → 读穿 → 内容一致 → 摘链 → 原件保留,全流程一轮。 */
async function runLinkRoundtrip(linkType: "junction" | "dir"): Promise<void> {
  const work = await tmp();
  const store = path.join(work, "store");
  await initializeStoreLayout(store);

  // 素材:从「真实目录」语义复制的源 skill(本测试自己造一份等价素材,不碰真实 home)
  const src = await makeSkill(path.join(work, "src", "demo-link"), "demo-link", "---\nname: demo-link\ndescription: e2e link roundtrip\n---\npayload");
  const adopted = await adoptSkillFolder(store, src, { kind: "local-scan", reference: src });
  expect(adopted.kind).toBe("adopted");
  if (adopted.kind !== "adopted") return;
  const storeSkill = path.join(store, STORE_SKILLS_DIR, "demo-link");
  const storeContent = await readFile(path.join(storeSkill, "SKILL.md"), "utf8");

  // 假 home 的客户端目录:真实存在的目录内放条目级链接(调研文档:目录级不可靠)
  const clientRoot = path.join(work, "home", ".claude", "skills");
  await mkdir(clientRoot, { recursive: true });
  const linkPath = path.join(clientRoot, "demo-link");
  await symlink(storeSkill, linkPath, linkType);

  // 1. 客户端读取路径能发现条目
  const entries = await readdir(clientRoot, { withFileTypes: true });
  expect(entries.some((e) => e.name === "demo-link")).toBe(true);

  // 2. 读穿透:经链接读到的是库存原件的内容
  expect(await readFile(path.join(linkPath, "SKILL.md"), "utf8")).toBe(storeContent);

  // 3. 摘链:只 unlink 链接,不碰目标
  await unlink(linkPath);
  expect(await readdir(clientRoot)).toEqual([]);

  // 4. 原件保留:store 目录内容原封不动
  expect(await readFile(path.join(storeSkill, "SKILL.md"), "utf8")).toBe(storeContent);
  expect((await readdir(storeSkill)).sort()).toEqual(["SKILL.md"]);
}

describe("沙箱链接读穿 E2E(#24)", () => {
  it.runIf(process.platform === "win32")("Windows:junction 建链→读穿→摘链→原件保留", async () => {
    await runLinkRoundtrip("junction");
  });

  it.runIf(process.platform !== "win32")("POSIX:symlink 建链→读穿→摘链→原件保留", async () => {
    await runLinkRoundtrip("dir");
  });

  it("本机链接能力与调研结论一致(win32 必有 junction)", async () => {
    const probe = await probeLinkTypes(await tmp());
    if (process.platform === "win32") expect(probe.junction).toBe(true);
    // symlink 在 Windows 上取决于开发者模式,不在此断言;hardlink 仅文件语义由 probe 类型保证
  });
});
