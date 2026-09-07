/**
 * skills.sh 市场链接收录(#41)。
 * 调研结论(#39,docs/audits/skills-sh-links-research-2026-08-16.md):
 * skills.sh 目录 API 全部要求 Vercel OIDC 认证(匿名 401),不适合做收录源;
 * 其 GitHub 源技能链接形态就是 <owner>/<repo>/<skill> 三段,
 * 因此**降级为解析成 GitHub 源,复用 #40 的 GitHubSourceProvider 拉取**。
 * site/ 前缀(非 GitHub 站点源)与 p/ 前缀(pack)本期明确不支持,
 * 报可读错误而不是静默。
 */

import type { GitHubSourceProvider } from "./github-source.js";

/** skills.sh 技能详情链接(三段 owner/repo/skill)。 */
const SKILLS_SH_RE = /^(?:https?:\/\/)?(?:www\.)?skills\.sh\/([^/\s]+)\/([^/\s]+)\/([^/\s]+?)(?:\/?[?#].*)?$/;

/** 任意 skills.sh 域名链接(site/p 也识别,由 fetch 层报明确不支持)。 */
const SKILLS_SH_DOMAIN_RE = /^(?:https?:\/\/)?(?:www\.)?skills\.sh\//;

/** 识别 skills.sh 链接(含 site/、p/ 前缀,避免被误当本地路径)。 */
export function isSkillsShUrl(input: string): boolean {
  return SKILLS_SH_DOMAIN_RE.test(input.trim());
}

/** 识别 skills.sh 技能详情链接(非 site/、非 p/ 前缀)。 */
export function isSkillsShSkillUrl(input: string): boolean {
  return parseSkillsShUrl(input) !== null;
}

export interface SkillsShUrlParts {
  owner: string;
  repo: string;
  slug: string;
}

/** 解析 skills.sh 三段链接;site/p 或不可识别返回 null。 */
export function parseSkillsShUrl(input: string): SkillsShUrlParts | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const m = SKILLS_SH_RE.exec(trimmed.split("?")[0] ?? trimmed);
  if (m === null) return null;
  const owner = m[1] ?? "";
  const repo = m[2] ?? "";
  const slug = m[3] ?? "";
  if (owner === "site" || owner === "p" || owner === "" || repo === "" || slug === "") return null;
  return { owner, repo, slug: decodeURIComponent(slug) };
}

export interface SkillsShSourceOptions {
  /** 底层 GitHub 拉取实现(测试注入 stub) */
  github: Pick<GitHubSourceProvider, "fetch" | "canHandle">;
}

/**
 * skills.sh 链接 → GitHub 降级拉取。canHandle/fetch 与 GitHub 源同构,
 * adopt 侧把它们并列分流即可。
 */
export class SkillsShSourceProvider {
  private readonly github: Pick<GitHubSourceProvider, "fetch" | "canHandle">;

  constructor(opts: SkillsShSourceOptions) {
    this.github = opts.github;
  }

  canHandle(input: string): boolean {
    return isSkillsShUrl(input);
  }

  /** 拉取并返回标准 skill 目录列表(目录在库存临时区,调用方负责清理)。 */
  async fetch(input: string): Promise<string[]> {
    const parts = parseSkillsShUrl(input);
    if (parts === null) {
      const t = input.trim();
      if (/\/site\//.test(t)) {
        throw new Error("skills.sh 的非 GitHub 站点来源(site/ 前缀)暂不支持收录: " + input);
      }
      if (/\/p\//.test(t)) {
        throw new Error("skills.sh 的 pack 合集(p/ 前缀)暂不支持收录: " + input);
      }
      throw new Error("不是可识别的 skills.sh 技能链接: " + input);
    }
    // 复用 GitHub 拉取:仓库根模式自动发现全部 skill 目录,再按 slug 过滤
    const githubUrl = "https://github.com/" + parts.owner + "/" + parts.repo;
    const dirs = await this.github.fetch(githubUrl);
    const matched = dirs.filter((d) => d.split(/[\\/]/).pop() === parts.slug);
    if (matched.length === 0) {
      throw new Error("skills.sh 上找不到与该 slug 匹配的 skill 目录: " + input + " (仓库 " + parts.owner + "/" + parts.repo + " 已拉取," + dirs.length + " 个含 SKILL.md 的目录,均不匹配 " + parts.slug + ")");
    }
    return matched;
  }
}
