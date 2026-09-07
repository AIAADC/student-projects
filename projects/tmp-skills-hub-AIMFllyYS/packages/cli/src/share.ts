/**
 * 把库存 skill 推到授信仓库(#119)。
 * 口径:docs/audits/skill-share-push-2026-08-17.md
 * 网络只在 cli;测试注入 fetchImpl,不打真实 GitHub。
 */

import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import {
  hashSkillFolder,
  listSkillFiles,
  parseGitHubUrl,
  readSkillFile,
  readStoreIndex,
  STORE_SKILLS_DIR,
  STORE_TMP_DIR,
  writeGitHubEntries,
} from "@skills-hub/core";
import { emitError, emitOk } from "./json-out.js";
import { requireWriteAuth, resolveNames, resolveStoreRootOrFail } from "./store-cmds.js";

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

export type ShareFailCode =
  | "bad-usage"
  | "auth-required"
  | "not-found"
  | "github-push-failed"
  | "remote-conflict";

export type ShareResult =
  | { ok: true; dirName: string; url: string; idempotent: boolean; dryRun: boolean }
  | { ok: false; code: ShareFailCode; message: string };

export interface ShareArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  repo: string | undefined;
  _: (string | number)[];
}

export interface PerformShareOptions {
  repo?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}

export function parseTrustedRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const short = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/.exec(trimmed);
  if (short !== null) return { owner: short[1]!, repo: short[2]! };
  const parts = parseGitHubUrl(trimmed);
  if (parts === null) return null;
  return { owner: parts.owner, repo: parts.repo.replace(/\.git$/i, "") };
}

export function shareTreeUrl(owner: string, repo: string, branch: string, dirName: string): string {
  return "https://github.com/" + owner + "/" + repo + "/tree/" + branch + "/skills/" + dirName;
}

export async function readTrustedRepoFromManifest(storeRoot: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await readFile(path.join(storeRoot, "manifest.json"), "utf8")) as { trustedRepo?: unknown };
    return typeof raw.trustedRepo === "string" && raw.trustedRepo.trim() !== "" ? raw.trustedRepo.trim() : null;
  } catch {
    return null;
  }
}

export async function performShare(storeRoot: string, target: string, opts: PerformShareOptions = {}): Promise<ShareResult> {
  const needle = target.trim();
  if (needle === "") return { ok: false, code: "bad-usage", message: "用法: skills-hub share <name|hash> [--repo owner/repo]" };

  const token = opts.token ?? process.env.GITHUB_TOKEN;
  if (token === undefined || token === "") {
    return { ok: false, code: "auth-required", message: "推送需要 GITHUB_TOKEN。设置环境变量后重试,token 不进配置文件。" };
  }

  const repoInput = opts.repo ?? (await readTrustedRepoFromManifest(storeRoot));
  if (repoInput === undefined || repoInput === null || repoInput === "") {
    return { ok: false, code: "bad-usage", message: "未配置授信仓库。在库存 manifest.json 写 trustedRepo,或传 --repo owner/repo。" };
  }
  const parsed = parseTrustedRepo(repoInput);
  if (parsed === null) return { ok: false, code: "bad-usage", message: "授信仓库地址无法解析: " + repoInput };

  const skills = await readStoreIndex(storeRoot);
  let dirName: string;
  try {
    const hit = resolveNames(needle, skills)[0];
    if (hit === undefined) return { ok: false, code: "not-found", message: "库存中没有 " + needle };
    dirName = hit;
  } catch (e) {
    return { ok: false, code: "not-found", message: e instanceof Error ? e.message : String(e) };
  }

  const skillDir = path.join(storeRoot, STORE_SKILLS_DIR, dirName);
  const localFiles = await readLocalSkillFiles(skillDir);
  if (localFiles.ok === false) return localFiles;
  const localHash = await hashSkillFolder(skillDir);

  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    authorization: "Bearer " + token,
    "x-github-api-version": "2026-03-10",
  };

  let repoJson: { default_branch: string };
  try {
    repoJson = (await ghJson(fetchImpl, API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo), headers)) as { default_branch: string };
  } catch (e) {
    return pushFail(e);
  }
  const branch = repoJson.default_branch;
  if (typeof branch !== "string" || branch === "") {
    return { ok: false, code: "github-push-failed", message: "授信仓库没有默认分支。请先在 GitHub 上建好仓库。" };
  }

  const prefix = "skills/" + dirName;
  let remotePaths: string[];
  try {
    const tree = (await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/trees/" + enc(branch) + "?recursive=1",
      headers,
    )) as { tree?: Array<{ path?: string; type?: string }> };
    remotePaths = (tree.tree ?? []).filter((e) => e.type === "blob" && typeof e.path === "string" && (e.path === prefix || e.path.startsWith(prefix + "/"))).map((e) => e.path!);
  } catch (e) {
    return pushFail(e);
  }

  const url = shareTreeUrl(parsed.owner, parsed.repo, branch, dirName);
  if (remotePaths.length > 0) {
    const remoteHash = await hashRemoteSkill(fetchImpl, headers, parsed, branch, prefix, remotePaths, storeRoot);
    if (remoteHash.ok === false) return remoteHash;
    if (remoteHash.hash === localHash) {
      return { ok: true, dirName, url, idempotent: true, dryRun: opts.dryRun === true };
    }
    return {
      ok: false,
      code: "remote-conflict",
      message: "远端已有同名不同内容: " + url + " (本地 " + localHash.slice(0, 12) + " ≠ 远端 " + remoteHash.hash.slice(0, 12) + ")。不覆盖。",
    };
  }

  if (opts.dryRun === true) {
    return { ok: true, dirName, url, idempotent: false, dryRun: true };
  }

  try {
    const ref = (await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/ref/heads/" + enc(branch),
      headers,
    )) as { object?: { sha?: string } };
    const parent = ref.object?.sha;
    if (parent === undefined || parent === "") {
      return { ok: false, code: "github-push-failed", message: "无法读取默认分支引用。空仓库请先在 GitHub 上建好默认分支。" };
    }
    const commit = (await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/commits/" + enc(parent),
      headers,
    )) as { tree?: { sha?: string } };
    const baseTree = commit.tree?.sha;
    if (baseTree === undefined || baseTree === "") {
      return { ok: false, code: "github-push-failed", message: "无法读取默认分支的 tree。" };
    }

    const createdTree = (await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/trees",
      headers,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTree,
          tree: localFiles.files.map((f) => ({
            path: prefix + "/" + f.path,
            mode: "100644",
            type: "blob",
            content: f.content,
          })),
        }),
      },
    )) as { sha?: string };
    if (createdTree.sha === undefined) return { ok: false, code: "github-push-failed", message: "创建 tree 未返回 sha。" };

    const createdCommit = (await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/commits",
      headers,
      {
        method: "POST",
        body: JSON.stringify({
          message: "share: " + dirName,
          tree: createdTree.sha,
          parents: [parent],
        }),
      },
    )) as { sha?: string };
    if (createdCommit.sha === undefined) return { ok: false, code: "github-push-failed", message: "创建 commit 未返回 sha。" };

    await ghJson(
      fetchImpl,
      API + "/repos/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/git/refs/heads/" + enc(branch),
      headers,
      { method: "PATCH", body: JSON.stringify({ sha: createdCommit.sha, force: false }) },
    );
  } catch (e) {
    return pushFail(e);
  }

  return { ok: true, dirName, url, idempotent: false, dryRun: false };
}

export async function runShare(args: ShareArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "share");
  if (storeRoot === null) return;
  if (args.dryRun !== true && !requireWriteAuth(args, "share")) return;
  const target = args._[0] === undefined ? "" : String(args._[0]);
  const opts: PerformShareOptions = { dryRun: args.dryRun === true };
  if (args.repo !== undefined && args.repo !== "") opts.repo = args.repo;
  const result = await performShare(storeRoot, target, opts);
  if (!result.ok) {
    emitError(args.json === true, "share", result.code, result.message);
    return;
  }
  if (args.json === true) {
    emitOk("share", {
      dirName: result.dirName,
      url: result.url,
      idempotent: result.idempotent,
      dryRun: result.dryRun,
    });
    return;
  }
  const tag = result.idempotent ? "已存在(内容相同)" : result.dryRun ? "预演" : "已分享";
  console.log(tag + ": " + result.url);
}

async function readLocalSkillFiles(skillDir: string): Promise<
  { ok: true; files: Array<{ path: string; content: string }> } | { ok: false; code: ShareFailCode; message: string }
> {
  const tree = await listSkillFiles(skillDir);
  if (!tree.ok) return { ok: false, code: "not-found", message: tree.message };
  const files: Array<{ path: string; content: string }> = [];
  for (const e of tree.entries) {
    if (e.kind !== "file") continue;
    const r = await readSkillFile(skillDir, e.path);
    if (!r.ok) {
      return { ok: false, code: "github-push-failed", message: "无法读取 " + e.path + ": " + r.message };
    }
    files.push({ path: e.path, content: r.content });
  }
  if (files.every((f) => f.path !== "SKILL.md")) {
    return { ok: false, code: "not-found", message: "skill 目录缺少 SKILL.md: " + skillDir };
  }
  return { ok: true, files };
}

async function hashRemoteSkill(
  fetchImpl: typeof fetch,
  headers: Record<string, string>,
  parsed: { owner: string; repo: string },
  branch: string,
  prefix: string,
  remotePaths: string[],
  storeRoot: string,
): Promise<{ ok: true; hash: string } | { ok: false; code: ShareFailCode; message: string }> {
  const tmp = path.join(storeRoot, STORE_TMP_DIR, "share-cmp-" + process.pid + "-" + Date.now());
  await mkdir(tmp, { recursive: true });
  try {
    const entries: Array<{ path: string; contents: string }> = [];
    for (const p of remotePaths) {
      const rel = p === prefix ? path.posix.basename(prefix) : p.slice(prefix.length + 1);
      const rawUrl = RAW + "/" + enc(parsed.owner) + "/" + enc(parsed.repo) + "/" + branch.split("/").map(enc).join("/") + "/" + p.split("/").map(enc).join("/");
      const text = await ghText(fetchImpl, rawUrl, headers);
      entries.push({ path: rel, contents: text });
    }
    await writeGitHubEntries(tmp, entries);
    return { ok: true, hash: await hashSkillFolder(tmp) };
  } catch (e) {
    return pushFail(e);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function pushFail(e: unknown): { ok: false; code: "github-push-failed"; message: string } {
  const message = e instanceof Error ? e.message : String(e);
  return { ok: false, code: "github-push-failed", message };
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

async function ghJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  init: { method?: string; body?: string } = {},
): Promise<unknown> {
  const text = await ghText(fetchImpl, url, headers, init);
  if (text === "") return {};
  return JSON.parse(text) as unknown;
}

async function ghText(
  fetchImpl: typeof fetch,
  url: string,
  headers: Record<string, string>,
  init: { method?: string; body?: string } = {},
): Promise<string> {
  const reqHeaders: Record<string, string> = { ...headers };
  if (init.body !== undefined) reqHeaders["content-type"] = "application/json";
  const res = await fetchImpl(url, {
    method: init.method ?? "GET",
    headers: reqHeaders,
    ...(init.body !== undefined ? { body: init.body } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("GitHub 拒绝推送(HTTP " + res.status + ")。检查 GITHUB_TOKEN 是否有该仓库 Contents: write。");
    }
    if (res.status === 404) {
      throw new Error("GitHub 资源不存在或无权访问(404): " + url);
    }
    if (res.status === 409 || res.status === 422) {
      throw new Error("无法更新默认分支(HTTP " + res.status + ")。可能是空仓库、非快进或分支保护,v1 不强制推送、不开 PR。");
    }
    if (res.status === 429) {
      throw new Error("GitHub 限流。请稍后重试,或确认已设置 GITHUB_TOKEN。");
    }
    throw new Error("GitHub 请求失败 HTTP " + res.status + ": " + url);
  }
  return text;
}
