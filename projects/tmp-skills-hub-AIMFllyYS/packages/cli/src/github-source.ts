/**
 * GitHub 收录来源(#40)。实现 core 的 SourceProvider 接口:
 * 一个 GitHub 链接 → 一个或多个标准 skill 文件夹(落在库存临时区)。
 *
 * 网络全部在 cli(核心是确定性内核,网络/进程放 cli,架构规范 §6):
 * - 仓库信息:GET api.github.com/repos/{owner}/{repo}(default_branch)
 * - 全树:GET api.github.com/repos/{owner}/{repo}/git/trees/{ref}?recursive=1
 * - 文件内容:GET raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}(不限流)
 * - 匿名限流 60 req/h/IP(仓库/树接口);设置 GITHUB_TOKEN 可提升
 * 来源:https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
 *
 * 失败语义:任何失败抛 Error(可读消息,含重试建议),调用方负责清理
 * 临时区;成功返回的目录在 storeRoot/tmp/github.<pid>-<ts>/ 下。
 */

import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { GitHubUrlParts } from "@skills-hub/core";
import {
  isGitHubUrl,
  parseGitHubUrl,
  writeGitHubEntries,
  STORE_TMP_DIR,
  type GitHubFileEntry,
} from "@skills-hub/core";

const API_BASE = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

interface RepoInfo {
  default_branch: string;
}

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
}

interface TreeResponse {
  tree: TreeEntry[];
}

export interface GitHubSourceOptions {
  /** 显式 token(测试/高级用法);缺省读 GITHUB_TOKEN 环境变量 */
  token?: string;
  /** 单请求超时毫秒,缺省 30s */
  timeoutMs?: number;
  /** fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
}

/**
 * GitHub 拉取实现。canHandle 为纯字符串判定;fetch 需要 storeRoot
 * 以把临时目录落在库存临时区(验证通过前不碰活跃区)。
 */
export class GitHubSourceProvider {
  private readonly token: string | undefined;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly storeRoot: string,
    opts: GitHubSourceOptions = {},
  ) {
    const t = opts.token ?? process.env.GITHUB_TOKEN;
    this.token = t !== undefined && t !== "" ? t : undefined;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  canHandle(input: string): boolean {
    return isGitHubUrl(input);
  }

  /** 拉取并返回标准 skill 目录列表(均在库存临时区,调用方负责清理)。 */
  async fetch(input: string): Promise<string[]> {
    const parts = parseGitHubUrl(input);
    if (parts === null) {
      throw new Error("不是可识别的 GitHub 链接: " + input);
    }
    const headers = this.token === undefined ? {} : { authorization: "Bearer " + this.token };

    // 1. 仓库信息:拿默认分支,顺带验证仓库存在
    const repoUrl = API_BASE + "/repos/" + encodeURIComponent(parts.owner) + "/" + encodeURIComponent(parts.repo);
    const repoJson = (await this.getJson(repoUrl, headers)) as RepoInfo;
    const ref = await this.resolveRef(parts, repoJson.default_branch, headers);

    // 2. 全树(递归一次拿全仓库文件清单)
    const treeUrl = API_BASE + "/repos/" + encodeURIComponent(parts.owner) + "/" + encodeURIComponent(parts.repo) + "/git/trees/" + encodeURIComponent(ref) + "?recursive=1";
    const treeJson = (await this.getJson(treeUrl, headers)) as TreeResponse;
    const blobs = treeJson.tree.filter((e) => e.type === "blob").map((e) => e.path);

    // 3. 候选目录:root 模式 → 根级含 SKILL.md 的目录(可多个);
    //    tree/blob 模式 → 目标目录(必须含 SKILL.md)
    const candidates = this.pickCandidates(parts, ref, blobs);
    if (candidates.length === 0) {
      throw new Error("该位置没有找到含 SKILL.md 的 skill 目录: " + input + " (已确认仓库 " + parts.owner + "/" + parts.repo + " 存在,ref=" + ref + ")");
    }

    // 4. 逐目录拉文件到临时区
    const tmpRoot = path.join(this.storeRoot, STORE_TMP_DIR, "github." + process.pid + "-" + Date.now());
    await mkdir(tmpRoot, { recursive: true });
    const out: string[] = [];
    try {
      for (const dir of candidates) {
        const entries: GitHubFileEntry[] = [];
        for (const p of blobs) {
          if (p === dir || p.startsWith(dir + "/")) {
            const rel = p === dir ? path.posix.basename(dir) : p.slice(dir.length + 1);
            const content = await this.getRaw(parts, ref, p, headers);
            entries.push({ path: rel, contents: content });
          }
        }
        const dest = path.join(tmpRoot, this.dirNameOf(dir));
        await writeGitHubEntries(dest, entries);
        out.push(dest);
      }
      return out;
    } catch (e) {
      await rm(tmpRoot, { recursive: true, force: true });
      throw e;
    }
  }

  /**
   * 消歧 ref:tree/blob 后的段可能是「分支(可含斜杠)+ 路径」。
   * 依序尝试:整段作 ref → 逐段前移(第一段作 ref,其余作路径)→ …;
   * 以 git/trees/{ref} 请求成功为准。root 模式直接用默认分支。
   */
  private async resolveRef(parts: GitHubUrlParts, defaultBranch: string, headers: Record<string, string>): Promise<string> {
    if (parts.mode === "root" || parts.trailing.length === 0) return defaultBranch;
    const trailing = parts.trailing;
    for (let take = trailing.length; take >= 1; take--) {
      const candidate = trailing.slice(0, take).join("/");
      const url = API_BASE + "/repos/" + encodeURIComponent(parts.owner) + "/" + encodeURIComponent(parts.repo) + "/git/trees/" + encodeURIComponent(candidate);
      try {
        const data = (await this.getJson(url, headers)) as TreeResponse;
        // 校验形状:git/trees 成功响应必须带 tree 数组(防止被其他 200 响应误判)
        if (Array.isArray(data.tree)) return candidate;
      } catch {
        // 该切分不是有效 ref,试下一个
      }
    }
    throw new Error("无法解析分支/tag: " + trailing.join("/") + " (链接的 ref 不存在)");
  }

  /** 候选 skill 目录(仓库内 POSIX 相对路径)。 */
  private pickCandidates(parts: { mode: "root" | "tree" | "blob"; trailing: string[] }, ref: string, blobs: string[]): string[] {
    if (parts.mode === "root" || parts.trailing.slice(ref.split("/").length).join("/") === "") {
      // 仓库根(任意深度):发现所有含 SKILL.md 的目录,每个是一个候选 skill
      const dirs = new Set<string>();
      for (const p of blobs) {
        if (p.endsWith("/SKILL.md")) {
          const d = p.slice(0, -"/SKILL.md".length);
          if (d !== "") dirs.add(d);
        }
      }
      return [...dirs].sort();
    }
    const target = parts.trailing.slice(ref.split("/").length).join("/");
    return blobs.includes(target + "/SKILL.md") ? [target] : [];
  }

  private dirNameOf(dir: string): string {
    return path.posix.basename(dir) || "skill";
  }

  private async getJson(url: string, headers: Record<string, string>): Promise<unknown> {
    return JSON.parse((await this.request(url, headers)).text);
  }

  private async getRaw(parts: { owner: string; repo: string }, ref: string, filePath: string, headers: Record<string, string>): Promise<string> {
    // ref 可含斜杠(分支名),按段编码以保留路径分隔;owner/repo 单段直接编码
    const refPath = ref.split("/").map((s) => encodeURIComponent(s)).join("/");
    const url = RAW_BASE + "/" + encodeURIComponent(parts.owner) + "/" + encodeURIComponent(parts.repo) + "/" + refPath + "/" + filePath;
    return (await this.request(url, headers)).text;
  }

  private async request(url: string, headers: Record<string, string>): Promise<{ text: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, { headers, signal: controller.signal });
    } catch (e) {
      if (controller.signal.aborted) {
        const err = new Error("访问 GitHub 超时(" + Math.round(this.timeoutMs / 1000) + "s),请检查网络后重试");
        if (e instanceof Error) err.cause = e;
        throw err;
      }
      const reason = e instanceof Error ? e.message : String(e);
      const err = new Error("无法连接 GitHub: " + reason + " (请检查网络后重试)");
      if (e instanceof Error) err.cause = e;
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error("GitHub 限流(匿名 60 次/小时):请稍后重试,或设置 GITHUB_TOKEN 提升额度");
      }
      if (res.status === 404) {
        throw new Error("GitHub 资源不存在(404),请检查链接: " + url);
      }
      throw new Error("GitHub 请求失败 HTTP " + res.status + ": " + url + " (请稍后重试)");
    }
    return { text };
  }
}
