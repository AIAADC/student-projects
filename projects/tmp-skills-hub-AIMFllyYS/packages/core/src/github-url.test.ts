import { describe, expect, it } from "vitest";
import { isGitHubUrl, parseGitHubUrl } from "./github-url.js";

describe("github-url", () => {
  it("识别 github.com 域名链接(https/裸域名,忽略查询串与锚点)", () => {
    expect(isGitHubUrl("https://github.com/vercel-labs/skills")).toBe(true);
    expect(isGitHubUrl("github.com/vercel-labs/skills")).toBe(true);
    expect(isGitHubUrl("https://github.com/vercel-labs/skills?tab=readme")).toBe(true);
    expect(isGitHubUrl("https://github.com/vercel-labs/skills#readme")).toBe(true);
  });

  it("不识别非 GitHub 输入", () => {
    expect(isGitHubUrl("https://skills.sh/vercel-labs/skills/find-skills")).toBe(false);
    expect(isGitHubUrl("C:/Users/me/skills/foo")).toBe(false);
    expect(isGitHubUrl("")).toBe(false);
  });

  it("解析仓库根链接", () => {
    expect(parseGitHubUrl("https://github.com/vercel-labs/skills")).toEqual({ owner: "vercel-labs", repo: "skills", mode: "root", trailing: [] });
  });

  it("解析 tree 链接(分支 + 子目录)", () => {
    expect(parseGitHubUrl("https://github.com/vercel-labs/skills/tree/main/skills/find-skills")).toEqual({
      owner: "vercel-labs",
      repo: "skills",
      mode: "tree",
      trailing: ["main", "skills", "find-skills"],
    });
  });

  it("解析 blob 链接(文件,收录其所在目录)", () => {
    expect(parseGitHubUrl("https://github.com/vercel-labs/skills/blob/main/skills/find-skills/SKILL.md")).toEqual({
      owner: "vercel-labs",
      repo: "skills",
      mode: "blob",
      trailing: ["main", "skills", "find-skills", "SKILL.md"],
    });
  });

  it("URL 解码路径段", () => {
    const parts = parseGitHubUrl("https://github.com/vercel-labs/skills/tree/main/skills/my%20skill");
    expect(parts?.trailing).toEqual(["main", "skills", "my skill"]);
  });

  it("非 tree/blob 段(issues/releases 等页面)返回 null", () => {
    expect(parseGitHubUrl("https://github.com/vercel-labs/skills/issues/42")).toBeNull();
  });
});
