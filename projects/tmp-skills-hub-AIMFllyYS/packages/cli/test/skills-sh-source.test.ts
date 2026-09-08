import { describe, expect, it, vi } from "vitest";
import { isSkillsShSkillUrl, parseSkillsShUrl, SkillsShSourceProvider } from "../src/skills-sh-source.js";

describe("skills-sh-source", () => {
  it("识别 skills.sh 技能详情链接(带或不带协议/域名)", () => {
    expect(isSkillsShSkillUrl("https://skills.sh/vercel-labs/skills/find-skills")).toBe(true);
    expect(isSkillsShSkillUrl("https://www.skills.sh/vercel-labs/skills/find-skills")).toBe(true);
    expect(isSkillsShSkillUrl("skills.sh/vercel-labs/skills/find-skills")).toBe(true);
    expect(isSkillsShSkillUrl("https://skills.sh/vercel-labs/skills/find-skills?tab=readme")).toBe(true);
  });

  it("site/ 与 p/ 前缀不识别(明确不支持)", () => {
    expect(isSkillsShSkillUrl("https://skills.sh/site/open.feishu.cn/lark-doc")).toBe(false);
    expect(isSkillsShSkillUrl("https://skills.sh/p/my-pack")).toBe(false);
  });

  it("解析三段链接", () => {
    expect(parseSkillsShUrl("https://skills.sh/vercel-labs/skills/find-skills")).toEqual({
      owner: "vercel-labs",
      repo: "skills",
      slug: "find-skills",
    });
  });

  it("fetch:解析为 GitHub 源并复用底层拉取,按 slug 过滤", async () => {
    const github = {
      canHandle: (_s: string) => true,
      fetch: vi.fn(async (url: string) => {
        expect(url).toBe("https://github.com/vercel-labs/skills");
        return ["/tmp/x/find-skills", "/tmp/x/other-skill"];
      }),
    };
    const p = new SkillsShSourceProvider({ github });
    const dirs = await p.fetch("https://skills.sh/vercel-labs/skills/find-skills");
    expect(dirs).toEqual(["/tmp/x/find-skills"]);
  });

  it("fetch:site/ 前缀报明确不支持", async () => {
    const p = new SkillsShSourceProvider({ github: { canHandle: () => true, fetch: async () => [] } });
    await expect(p.fetch("https://skills.sh/site/open.feishu.cn/lark-doc")).rejects.toThrow(/site\//);
  });

  it("fetch:p/ 前缀报明确不支持", async () => {
    const p = new SkillsShSourceProvider({ github: { canHandle: () => true, fetch: async () => [] } });
    await expect(p.fetch("https://skills.sh/p/my-pack")).rejects.toThrow(/pack/);
  });

  it("fetch:slug 不匹配报可读错误(列出已发现目录数)", async () => {
    const github = { canHandle: () => true, fetch: async () => ["/tmp/x/a", "/tmp/x/b"] };
    const p = new SkillsShSourceProvider({ github });
    await expect(p.fetch("https://skills.sh/org/repo/ghost")).rejects.toThrow(/ghost.*2 个含 SKILL\.md/);
  });
});
