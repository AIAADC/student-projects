import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STORE_TMP_DIR } from "@skills-hub/core";
import { GitHubSourceProvider } from "../src/github-source.js";

/** 路由式 fetch 替身:URL 前缀 → JSON 或文本响应。 */
function stubFetch(routes: Record<string, { status: number; body: string }>) {
  return async (url: string): Promise<Response> => {
    // 精确边界匹配:URL 等于 key,或 key 后紧跟 "/" 或 "?" ——
    // 避免 /repos/org/repo 吞掉 git/trees/... 请求、main 吞掉 main%2Fskills 之类编码路径
    const hit = Object.entries(routes)
      .sort(([a], [b]) => b.length - a.length)
      .find(([prefix]) => {
        if (!url.startsWith(prefix)) return false;
        // key 以 "/" 结尾:剩余部分就是子路径,直接算匹配
        if (prefix.endsWith("/")) return true;
        const next = url[prefix.length];
        return next === undefined || next === "/" || next === "?";
      });
    if (hit === undefined) return new Response("not found", { status: 404 });
    return new Response(hit[1].body, { status: hit[1].status });
  };
}

const REPO_OK = JSON.stringify({ default_branch: "main" });
const TREE = (paths: string[]) =>
  JSON.stringify({ tree: paths.map((p) => ({ path: p, type: "blob" })) });

describe("GitHubSourceProvider", () => {
  let store: string;
  beforeEach(async () => {
    store = await mkdtemp(path.join(os.tmpdir(), "ghsrc-"));
    await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(store, STORE_TMP_DIR), { recursive: true }));
  });
  afterEach(async () => {
    await rm(store, { recursive: true, force: true });
  });

  it("canHandle 只认 github.com 链接", () => {
    const p = new GitHubSourceProvider(store, { fetchImpl: stubFetch({}) });
    expect(p.canHandle("https://github.com/a/b")).toBe(true);
    expect(p.canHandle("C:/skills/foo")).toBe(false);
  });

  it("仓库根:收录根下所有含 SKILL.md 的目录", async () => {
    const fetchImpl = stubFetch({
      "https://api.github.com/repos/org/repo": { status: 200, body: REPO_OK },
      "https://api.github.com/repos/org/repo/git/trees/main?recursive=1": {
        status: 200,
        body: TREE(["skills/a/SKILL.md", "skills/a/tool.js", "skills/b/SKILL.md", "README.md"]),
      },
      "https://raw.githubusercontent.com/org/repo/main/": { status: 200, body: "content" },
    });
    const p = new GitHubSourceProvider(store, { fetchImpl });
    const dirs = await p.fetch("https://github.com/org/repo");
    expect(dirs).toHaveLength(2);
    const names = (await readdir(path.dirname(dirs[0] ?? ""))).sort();
    expect(names).toEqual(["a", "b"]);
    expect(await readFile(path.join(dirs[0] ?? "", "SKILL.md"), "utf8")).toBe("content");
    expect(await readFile(path.join(dirs[0] ?? "", "tool.js"), "utf8")).toBe("content");
  });

  it("tree 链接:只收录目标目录", async () => {
    const fetchImpl = stubFetch({
      "https://api.github.com/repos/org/repo": { status: 200, body: REPO_OK },
      "https://api.github.com/repos/org/repo/git/trees/main": { status: 200, body: TREE([]) },
      "https://api.github.com/repos/org/repo/git/trees/main?recursive=1": {
        status: 200,
        body: TREE(["skills/a/SKILL.md", "skills/a/tool.js", "skills/b/SKILL.md"]),
      },
      "https://raw.githubusercontent.com/org/repo/main/skills/a/": { status: 200, body: "content" },
    });
    const p = new GitHubSourceProvider(store, { fetchImpl });
    const dirs = await p.fetch("https://github.com/org/repo/tree/main/skills/a");
    expect(dirs).toHaveLength(1);
    expect(path.basename(dirs[0] ?? "")).toBe("a");
    expect(await readdir(dirs[0] ?? "")).toEqual(["SKILL.md", "tool.js"]);
  });

  it("ref 消歧:分支名含斜杠时整段作 ref", async () => {
    const fetchImpl = stubFetch({
      "https://api.github.com/repos/org/repo": { status: 200, body: REPO_OK },
      "https://api.github.com/repos/org/repo/git/trees/feature%2Fx": { status: 200, body: TREE([]) },
      "https://api.github.com/repos/org/repo/git/trees/feature/x": { status: 200, body: TREE([]) },
      "https://api.github.com/repos/org/repo/git/trees/feature%2Fx?recursive=1": {
        status: 200,
        body: TREE(["skill/SKILL.md"]),
      },
      "https://raw.githubusercontent.com/org/repo/feature/x/skill/": { status: 200, body: "c" },
    });
    const p = new GitHubSourceProvider(store, { fetchImpl });
    const dirs = await p.fetch("https://github.com/org/repo/tree/feature/x/skill");
    expect(dirs).toHaveLength(1);
    expect(path.basename(dirs[0] ?? "")).toBe("skill");
  });

  it("目标目录无 SKILL.md:报可读错误", async () => {
    const fetchImpl = stubFetch({
      "https://api.github.com/repos/org/repo": { status: 200, body: REPO_OK },
      "https://api.github.com/repos/org/repo/git/trees/main": { status: 200, body: TREE([]) },
      "https://api.github.com/repos/org/repo/git/trees/main?recursive=1": {
        status: 200,
        body: TREE(["docs/README.md"]),
      },
    });
    const p = new GitHubSourceProvider(store, { fetchImpl });
    await expect(p.fetch("https://github.com/org/repo/tree/main/docs")).rejects.toThrow(/SKILL\.md/);
    // 失败不留残留
    expect(await readdir(path.join(store, STORE_TMP_DIR))).toEqual([]);
  });

  it("仓库 404:报可读错误(链接不存在)", async () => {
    const p = new GitHubSourceProvider(store, { fetchImpl: stubFetch({ "https://api.github.com/repos/nope/missing": { status: 404, body: "{}" } }) });
    await expect(p.fetch("https://github.com/nope/missing")).rejects.toThrow(/404/);
  });

  it("403 限流:提示设置 GITHUB_TOKEN", async () => {
    const p = new GitHubSourceProvider(store, { fetchImpl: stubFetch({ "https://api.github.com/repos/org/repo": { status: 403, body: "{}" } }) });
    await expect(p.fetch("https://github.com/org/repo")).rejects.toThrow(/限流.*GITHUB_TOKEN/);
  });

  it("网络失败:可读错误含重试建议,临时区无残留", async () => {
    const fetchImpl = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };
    const p = new GitHubSourceProvider(store, { fetchImpl });
    await expect(p.fetch("https://github.com/org/repo")).rejects.toThrow(/无法连接 GitHub.*重试/);
    expect(await readdir(path.join(store, STORE_TMP_DIR))).toEqual([]);
  });

  it("timeout:可读超时错误", async () => {
    const fetchImpl = (_url: string, init?: RequestInit): Promise<Response> =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const p = new GitHubSourceProvider(store, { fetchImpl, timeoutMs: 50 });
    await expect(p.fetch("https://github.com/org/repo")).rejects.toThrow(/超时/);
  });
});
