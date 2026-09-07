/**
 * GitHub 链接解析(#40)。纯字符串函数,不发起任何网络请求。
 * 支持形态:
 * - https://github.com/<owner>/<repo>  → 仓库根
 * - https://github.com/<owner>/<repo>/tree/<ref>/<path...> → 分支/tag/commit + 子目录
 * - https://github.com/<owner>/<repo>/blob/<ref>/<path...> → 文件(收录其所在目录)
 * 分支名可含斜杠(tree 后的段是 ref 还是 path 存在歧义,
 * 解析只做切分,由拉取层按「整段作 ref → 逐段前移」两级尝试消歧)。
 */

export interface GitHubUrlParts {
  owner: string;
  repo: string;
  /** root: 无 tree/blob 段;tree/blob: 其后的全部路径段(可能含 ref) */
  mode: "root" | "tree" | "blob";
  trailing: string[];
}

/** 识别 github.com 域名下的链接(https 或裸域名,忽略查询串与锚点)。 */
export function isGitHubUrl(input: string): boolean {
  return parseGitHubUrl(input) !== null;
}

/**
 * 解析 GitHub 链接;不可识别的输入返回 null。
 * 清洗:去协议/域名、查询串(?)、锚点(#)、首尾斜杠,路径段 URL 解码。
 */
export function parseGitHubUrl(input: string): GitHubUrlParts | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  const withoutAnchor = withoutQuery.split("#")[0] ?? withoutQuery;
  const m = /^(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s]+)(?:\/([^\s]*))?$/.exec(withoutAnchor);
  if (m === null) return null;
  const owner = m[1] ?? "";
  const repo = m[2] ?? "";
  if (owner === "" || repo === "") return null;
  const rest = (m[3] ?? "").split("/").map((s) => decodeURIComponent(s)).filter((s) => s !== "");
  if (rest.length === 0) return { owner, repo, mode: "root", trailing: [] };
  const kind = rest[0];
  if (kind === "tree" || kind === "blob") {
    return { owner, repo, mode: kind, trailing: rest.slice(1) };
  }
  // 非 tree/blob 段(如 /issues、/releases 等页面):不属于可收录形态
  return null;
}
