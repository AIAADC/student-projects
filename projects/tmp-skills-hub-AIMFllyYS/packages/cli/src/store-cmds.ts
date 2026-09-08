import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  adoptMany,
  archiveSkill,
  attachVisibleIn,
  restoreArchivedSkill,
  discoverClientRoots,
  discoverClientRootsAt,
  hashSkillFolder,
  listArchivedSkills,
  readGroups,
  readLinksLedger,
  readStoreIndex,
  recordUsage,
  resolveStoreRoot,
  STORE_ARCHIVE_DIR,
  STORE_SKILLS_DIR,
  type AdoptInput,
  type SkillRecord,
  type StoreRootOptions,
} from "@skills-hub/core";
import { isGitHubUrl, STORE_TMP_DIR } from "@skills-hub/core";
import { GitHubSourceProvider } from "./github-source.js";
import { isSkillsShUrl, SkillsShSourceProvider } from "./skills-sh-source.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { performLinkChange, previewLinkChange, type LinkChangeRequest } from "./link-actions.js";
import { resolveNames } from "./resolve-skill.js";

export { resolveNames, resolveSkill } from "./resolve-skill.js";
export type { ResolveSkillFailure, ResolveSkillResult } from "./resolve-skill.js";

export const POINTER_REL = path.join(".skills-hub", "config.json");

/** 指针文件:tmp+rename 原子写。init 与 bootstrap 共用。 */
export async function writePointerFile(home: string, storeRoot: string): Promise<string> {
  const pointerFile = path.join(home, POINTER_REL);
  await mkdir(path.dirname(pointerFile), { recursive: true });
  const tmp = pointerFile + ".tmp-" + process.pid + "-" + Date.now();
  await writeFile(tmp, JSON.stringify({ storeRoot }, null, 2) + "\n", "utf8");
  await rename(tmp, pointerFile);
  return pointerFile;
}

/** 解析库存位置;未配置时输出契约失败信封并返回 null(退出码 2 由 helper 设置)。 */
export async function resolveStoreRootOrFail(args: { home: string | undefined; json: boolean | undefined }, command: string): Promise<string | null> {
  const home = resolveHome(args.home);
  const opts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
  if (args.home !== undefined && args.home !== "") opts.cliHome = args.home;
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") opts.envHome = envHome;
  const store = await resolveStoreRoot(opts);
  if (!store.ok) {
    emitError(args.json === true, command, "store-not-configured", "库存未配置:" + store.message + " — 请先运行 skills-hub init --home <path> --yes");
    return null;
  }
  return store.storeRoot;
}

/** 写操作授权铁律(cli-commands-v0.md §2):非交互环境必须显式 --yes。 */
export function requireWriteAuth(args: { yes: boolean | undefined; json: boolean | undefined }, command: string): boolean {
  if (process.stdin.isTTY || args.yes === true) return true;
  emitError(args.json === true, command, "auth-required", "写操作需要显式授权:非交互环境请加 --yes。");
  return false;
}

export interface AdoptArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export interface AdoptOutcomeJson {
  kind: string;
  folder: string;
  hash?: string | undefined;
  existingHash?: string | undefined;
  incomingHash?: string | undefined;
  reason?: string | undefined;
}

export interface AdoptPerformResult {
  dryRun: boolean;
  storeRoot: string;
  adopted: number;
  duplicates: number;
  conflicts: number;
  invalid: number;
  fetchFailed: boolean;
  fetchMessage?: string | undefined;
  outcomes: AdoptOutcomeJson[];
}

/** CLI 与 HTTP 共用的收录执行层:去重/冲突仍走 adoptMany,不另写一套。 */
export async function performAdopt(
  storeRoot: string,
  sources: string[],
  opts: { dryRun?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<AdoptPerformResult> {
  const dryRun = opts.dryRun === true;
  const inputs: AdoptInput[] = [];
  let fetchFailed = false;
  let fetchMessage: string | undefined;

  for (const p of sources) {
    if (isGitHubUrl(p) || isSkillsShUrl(p)) continue;
    inputs.push({
      folderPath: path.resolve(p),
      origin: { kind: "local-scan", reference: path.resolve(p) },
    });
  }

  const urlPaths = sources.filter((p) => isGitHubUrl(p) || isSkillsShUrl(p));
  if (urlPaths.length > 0) {
    const github = new GitHubSourceProvider(
      storeRoot,
      opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {},
    );
    const skillsSh = new SkillsShSourceProvider({ github });
    for (const u of urlPaths) {
      try {
        const isSh = isSkillsShUrl(u);
        const provider = isSh ? skillsSh : github;
        const dirs = await provider.fetch(u);
        const kind = isSh ? ("skills-sh" as const) : ("github" as const);
        for (const d of dirs) {
          inputs.push({ folderPath: d, origin: { kind, reference: u } });
        }
      } catch (e) {
        fetchFailed = true;
        fetchMessage = e instanceof Error ? e.message : String(e);
      }
    }
  }

  const report = await adoptMany(storeRoot, inputs, { dryRun });
  await cleanupGithubTmp(storeRoot);

  return {
    dryRun,
    storeRoot,
    adopted: report.adopted,
    duplicates: report.duplicates,
    conflicts: report.conflicts,
    invalid: report.invalid,
    fetchFailed,
    fetchMessage,
    outcomes: report.outcomes.map((o) => ({
      kind: o.kind,
      folder: o.kind === "invalid" ? o.folderPath : o.kind === "conflict" ? o.name : o.record.dirName,
      ...(o.kind === "adopted" || o.kind === "duplicate" ? { hash: o.record.hash } : {}),
      ...(o.kind === "conflict" ? { existingHash: o.existingHash, incomingHash: o.incomingHash } : {}),
      ...(o.kind === "invalid" ? { reason: o.reason } : {}),
    })),
  };
}

export async function runAdopt(args: AdoptArgs): Promise<void> {
  const paths = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (paths.length === 0) {
    console.error("用法: skills-hub adopt <本地skill目录路径|GitHub链接> [--yes] [--dry-run]");
    process.exitCode = 2;
    return;
  }
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "adopt")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "adopt");
  if (storeRoot === null) return;

  const report = await performAdopt(storeRoot, paths, { dryRun });

  if (args.json) {
    if (report.fetchFailed && report.fetchMessage !== undefined && report.outcomes.length === 0) {
      emitError(true, "adopt", "github-fetch-failed", report.fetchMessage);
      return;
    }
    emitOk("adopt", {
      dryRun,
      storeRoot,
      outcomes: report.outcomes,
      adopted: report.adopted,
      duplicates: report.duplicates,
      conflicts: report.conflicts,
      invalid: report.invalid,
      fetchFailed: report.fetchFailed,
    });
    return;
  }
  if (report.fetchFailed && report.fetchMessage !== undefined) {
    console.error("✗ 拉取失败: " + report.fetchMessage);
  }
  for (const o of report.outcomes) {
    if (o.kind === "adopted") console.log("✓ 已收录: " + o.folder + " (" + (o.hash ?? "").slice(0, 12) + ")");
    else if (o.kind === "duplicate") console.log("≈ 已存在(内容相同): " + o.folder + " — 来源已并入记录");
    else if (o.kind === "conflict") console.log("✗ 冲突(同名不同内容): " + o.folder + " — 未覆盖,现有哈希 " + (o.existingHash ?? "").slice(0, 12));
    else console.log("✗ 未收录(缺 name/description): " + o.folder);
  }
  console.log((dryRun ? "预演结果" : "收录结果") + `: 新增 ${report.adopted} / 重复 ${report.duplicates} / 冲突 ${report.conflicts} / 未达标 ${report.invalid}`);
  if (report.fetchFailed) process.exitCode = 3;
}

export interface ListArgs {
  home: string | undefined;
  json: boolean | undefined;
  source: string | undefined;
  enabled: boolean | undefined;
}

/** 清掉库存临时区里本次会话遗留的 github.* 目录(adopt 已入位的 adopt.* 已 rename,不受影响)。 */
async function cleanupGithubTmp(storeRoot: string): Promise<void> {
  const tmpDir = path.join(storeRoot, STORE_TMP_DIR);
  let names: string[];
  try {
    names = await readdir(tmpDir);
  } catch {
    return; // tmp 不存在则无事可做
  }
  for (const name of names) {
    if (name.startsWith("github.")) {
      await rm(path.join(tmpDir, name), { recursive: true, force: true });
    }
  }
}

export async function runList(args: ListArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "list");
  if (storeRoot === null) return;
  let skills = attachVisibleIn(await readStoreIndex(storeRoot), await readLinksLedger(storeRoot));
  if (args.source !== undefined && args.source !== "") {
    const needle = args.source.toLowerCase();
    skills = skills.filter((s) =>
      s.origins.some((o) => o.kind.toLowerCase() === needle || o.reference.toLowerCase().includes(needle)),
    );
  }
  if (args.enabled === true) {
    skills = skills.filter((s) => s.visibleIn.length > 0);
  }
  if (args.json) {
    emitOk("list", { storeRoot, total: skills.length, skills });
    return;
  }
  if (skills.length === 0) {
    console.log("库存为空" + (args.enabled ? "(启用状态过滤后)" : "") + "。用 skills-hub adopt 收录。");
    return;
  }
  for (const s of skills) {
    const origins = s.origins.map((o) => o.kind).join(",");
    const enabled = s.visibleIn.length > 0 ? " [启用]" : "";
    console.log(s.hash.slice(0, 12) + "  " + s.dirName + "  (来源: " + origins + ")" + enabled);
  }
  console.log("共 " + skills.length + " 个");
}

export interface ShowArgs {
  home: string | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runShow(args: ShowArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "show");
  if (storeRoot === null) return;
  const needle = String(args._[0] ?? "").trim();
  if (needle === "") {
    emitError(args.json === true, "show", "bad-usage", "用法: skills-hub show <skill名或哈希前缀>");
    return;
  }
  const skills = attachVisibleIn(await readStoreIndex(storeRoot), await readLinksLedger(storeRoot));
  const exact = skills.find((s) => s.dirName === needle);
  const byHash = exact === undefined ? skills.filter((s) => s.hash.startsWith(needle.toLowerCase())) : [];
  if (exact === undefined && byHash.length === 0) {
    emitError(args.json === true, "show", "not-found", "未找到: " + needle + "。先 skills-hub list 看有哪些。" + (skills.length === 0 ? "(库存为空)" : ""));
    return;
  }
  const records: SkillRecord[] = exact !== undefined ? [exact] : byHash.slice(0, 10);
  // #27:show 是一次真实使用意图,每条展示的记录记一次(失败静默,不影响主流程)
  for (const s of records) await recordUsage(storeRoot, s.hash, "show").catch(() => undefined);
  if (args.json) {
    emitOk("show", { storeRoot, matches: records });
    return;
  }
  for (const s of records) {
    console.log("名称: " + s.dirName);
    console.log("哈希: " + s.hash);
    console.log("描述: " + s.meta.description);
    console.log("来源: " + s.origins.map((o) => o.kind + " " + o.reference).join(" | "));
    console.log("入库: " + s.installedAt);
    console.log("启用: " + (s.visibleIn.length > 0 ? s.visibleIn.join(", ") : "未启用"));
    console.log("---");
  }
}

export interface VerifyArgs {
  home: string | undefined;
  json: boolean | undefined;
}

export interface VerifyDrift {
  name: string;
  recordedHash: string;
  actualHash: string;
}

export interface VerifyMissing {
  name: string;
  recordedHash: string;
}

export interface VerifyReport {
  storeRoot: string;
  checked: number;
  passed: string[];
  drifted: VerifyDrift[];
  missing: VerifyMissing[];
}

/** 重算哈希对照清单。只读,不改写快照。 */
export async function performVerify(storeRoot: string): Promise<VerifyReport> {
  const skills = await readStoreIndex(storeRoot);
  const drifted: VerifyDrift[] = [];
  const missing: VerifyMissing[] = [];
  const passed: string[] = [];
  for (const s of skills) {
    const dir = path.join(storeRoot, STORE_SKILLS_DIR, s.dirName);
    const actual = await hashSkillFolder(dir).catch(() => null);
    if (actual === null) {
      missing.push({ name: s.dirName, recordedHash: s.hash });
      continue;
    }
    if (actual === s.hash) passed.push(s.dirName);
    else drifted.push({ name: s.dirName, recordedHash: s.hash, actualHash: actual });
  }
  return { storeRoot, checked: skills.length, passed, drifted, missing };
}

export async function runVerify(args: VerifyArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "verify");
  if (storeRoot === null) return;
  const report = await performVerify(storeRoot);
  if (args.json) {
    console.log(JSON.stringify({
      storeRoot: report.storeRoot,
      checked: report.checked,
      ok: report.passed,
      drifted: report.drifted,
      missing: report.missing,
    }, null, 2));
    return;
  }
  console.log("校验 " + report.checked + " 个:");
  if (report.passed.length > 0) console.log("  ✓ " + report.passed.length + " 个与记录一致");
  for (const d of report.drifted) console.log("  ! 漂移: " + d.name + " (记录 " + d.recordedHash.slice(0, 12) + " ≠ 实际 " + d.actualHash.slice(0, 12) + ")");
  for (const m of report.missing) console.log("  ! 缺失: " + m.name + " (目录不存在)");
  if (report.drifted.length === 0 && report.missing.length === 0) console.log("全部一致,无漂移。");
  else console.log("发现 " + (report.drifted.length + report.missing.length) + " 处漂移/缺失 — verify 不自动改写,如需更新请重新 adopt 或人工处理。");
}

// ============ enable / disable(#22):受管链接集合的 CLI 入口 ============

export interface LinkCmdArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  client: string | undefined;
  /** global(默认,home 下)/ project(cwd 下) */
  scope: string | undefined;
  /** 按分组批量操作(--group <id>,与按名互斥) */
  group: string | undefined;
  _: (string | number)[];
}

/** 解析目标客户端 skills 根。默认行为:未指定 --client 时报错并列出可用客户端,绝不猜默认写入对象。 */
export async function resolveClientSkillsDir(args: LinkCmdArgs): Promise<{ clientId: string; skillsDir: string } | null> {
  const scope = args.scope === "project" ? "project" : "global";
  const base = scope === "project" ? process.cwd() : resolveHome(args.home);
  const roots = scope === "project" ? await discoverClientRootsAt(base) : await discoverClientRoots(base);
  if (args.client === undefined || args.client === "") {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    console.error("未指定 --client。可用客户端(" + scope + "侧): " + list);
    console.error("默认行为:未指定 --client 时报错并列出可用客户端,绝不猜默认写入对象。");
    process.exitCode = 2;
    return null;
  }
  const root = roots.find((r) => r.clientId === args.client);
  if (root === undefined) {
    const list = roots.length > 0 ? roots.map((r) => r.clientId).join(", ") : "(无)";
    console.error("未找到客户端 " + args.client + "(" + scope + "侧)。可用: " + list);
    process.exitCode = 2;
    return null;
  }
  return { clientId: root.clientId, skillsDir: root.skillsDir };
}

/** 解析操作目标:按名或按分组(二选一,互斥校验)。返回 dirName 列表。 */
async function resolveLinkTargets(
  args: LinkCmdArgs,
  skills: Awaited<ReturnType<typeof readStoreIndex>>,
  storeRoot: string,
  command: "enable" | "disable",
): Promise<string[] | null> {
  const names = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  const groupId = args.group;
  if (names.length > 0 && groupId !== undefined) {
    emitError(args.json === true, command, "bad-usage", "enable/disable 不能同时按名与按分组(--group),请二选一。");
    return null;
  }
  if (groupId !== undefined) {
    const groups = await readGroups(storeRoot);
    const g = groups.groups.find((x) => x.id === groupId);
    if (g === undefined) {
      emitError(args.json === true, command, "group-not-found", "分组不存在: " + groupId + "。skills-hub group list 查看。");
      return null;
    }
    const memberHashes = new Set(g.memberHashes);
    const dirNames = skills.filter((s) => memberHashes.has(s.hash)).map((s) => s.dirName);
    if (dirNames.length === 0) {
      emitError(args.json === true, command, "group-empty", "分组 " + groupId + " 里没有 skill。先 skills-hub group add <id> <skill名...> 加入。");
      return null;
    }
    return dirNames;
  }
  if (names.length === 0) {
    emitError(args.json === true, command, "bad-usage", "用法: skills-hub enable <skill名或哈希前缀...> --client <id> [--group <id>] [--scope global|project] [--yes] [--dry-run]");
    return null;
  }
  try {
    return names.flatMap((n) => resolveNames(n, skills));
  } catch (e) {
    emitError(args.json === true, command, "not-found", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export async function runEnable(args: LinkCmdArgs): Promise<void> {
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "enable")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "enable");
  if (storeRoot === null) return;
  const client = await resolveClientSkillsDir(args);
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "enable");
  if (dirNames === null) return;

  const req: LinkChangeRequest = { storeRoot, clientId: client.clientId, scope, skillsDir: client.skillsDir, dirNames };

  if (dryRun) {
    const preview = await previewLinkChange(req, "enable");
    const wouldCreate = preview.wouldCreate.map((e) => e.dirName);
    const wouldRemove = preview.wouldRemove.map((e) => e.dirName);
    if (args.json) emitOk("enable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldCreate, wouldRemove });
    else {
      console.log("预演(不写盘):");
      for (const n of wouldCreate) console.log("  将建立链接: " + n + " → " + client.skillsDir);
      for (const n of wouldRemove) console.log("  将摘除链接: " + n);
      for (const x of preview.conflicts) console.log("  冲突: " + x.dirName + " — " + x.reason);
      if (wouldCreate.length === 0 && wouldRemove.length === 0 && preview.conflicts.length === 0) console.log("  无变更");
    }
    return;
  }

  const result = await performLinkChange(req, "enable");
  if (!result.ok) {
    emitError(args.json === true, "enable", result.code, "enable 失败: " + result.message);
    return;
  }
  if (args.json) {
    emitOk("enable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: result.created, removed: result.removed });
    return;
  }
  for (const p of result.created) console.log("✓ 已启用: " + path.basename(p) + " → " + client.skillsDir);
  for (const p of result.removed) console.log("  (更新:摘除旧链接 " + path.basename(p) + ")");
  console.log("enable 完成,共 " + result.created.length + " 个。" + (result.removed.length > 0 ? "(顺带清理 " + result.removed.length + " 个旧链接)" : ""));
}

export async function runDisable(args: LinkCmdArgs): Promise<void> {
  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "disable")) return;
  const storeRoot = await resolveStoreRootOrFail(args, "disable");
  if (storeRoot === null) return;
  const client = await resolveClientSkillsDir(args);
  if (client === null) return;
  const scope = args.scope === "project" ? "project" : "global";

  const skills = await readStoreIndex(storeRoot);
  const dirNames = await resolveLinkTargets(args, skills, storeRoot, "disable");
  if (dirNames === null) return;

  const req: LinkChangeRequest = { storeRoot, clientId: client.clientId, scope, skillsDir: client.skillsDir, dirNames };

  if (dryRun) {
    const preview = await previewLinkChange(req, "disable");
    const wouldRemove = preview.wouldRemove.map((e) => e.dirName);
    if (args.json) emitOk("disable", { dryRun: true, clientId: client.clientId, scope, targetDir: client.skillsDir, wouldRemove });
    else {
      console.log("预演(不写盘):");
      for (const n of wouldRemove) console.log("  将摘除链接: " + n + "(原件保留在库存)");
      for (const x of preview.conflicts) console.log("  冲突: " + x.dirName + " — " + x.reason);
      if (wouldRemove.length === 0 && preview.conflicts.length === 0) console.log("  无变更(这些 skill 未在此客户端启用)");
    }
    return;
  }

  const result = await performLinkChange(req, "disable");
  if (result.ok && result.created.length === 0 && result.removed.length === 0) {
    if (args.json) emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: [], removed: [], unchanged: dirNames });
    else console.log("未变更:这些 skill 未在 " + client.clientId + " 启用(原件保留在库存)。");
    return;
  }
  if (!result.ok) {
    emitError(args.json === true, "disable", result.code, "disable 失败: " + result.message);
    return;
  }
  if (args.json) {
    emitOk("disable", { clientId: client.clientId, scope, targetDir: client.skillsDir, created: result.created, removed: result.removed });
    return;
  }
  for (const p of result.removed) console.log("✓ 已禁用(摘除链接): " + path.basename(p));
  console.log("disable 完成,摘除 " + result.removed.length + " 个链接。库存原件一个字节未动。" + (result.created.length > 0 ? "(顺带建立 " + result.created.length + " 个新链接)" : ""));
}

// ============ archive(#23):软删除与归档 ============

export interface ArchiveArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  _: (string | number)[];
}

export async function runArchive(args: ArchiveArgs): Promise<void> {
  const names = args._.filter((p): p is string => typeof p === "string" && p.trim() !== "");
  const storeRoot = await resolveStoreRootOrFail(args, "archive");
  if (storeRoot === null) return;

  if (names[0] === "restore") {
    const targets = names.slice(1);
    if (targets.length === 0) {
      emitError(args.json === true, "archive", "bad-usage", "用法: skills-hub archive restore <name>");
      return;
    }
    const dryRun = args.dryRun === true;
    if (!dryRun && !requireWriteAuth(args, "archive")) return;
    if (dryRun) {
      if (args.json) emitOk("archive", { verb: "restore", dryRun: true, names: targets });
      else {
        console.log("预演(不写盘):");
        for (const n of targets) console.log("  将恢复: " + n);
      }
      return;
    }
    let failed = 0;
    const results: unknown[] = [];
    for (const n of targets) {
      const res = await restoreArchivedSkill(storeRoot, n);
      if (res.ok) {
        results.push({ name: n, ok: true, hash: res.hash, archiveFile: res.archiveFile });
        console.log("✓ 已恢复: " + res.dirName + " (" + res.hash.slice(0, 12) + ")");
      } else {
        failed++;
        results.push({ name: n, ok: false, code: res.code, message: res.message });
        console.error("✗ 恢复失败: " + n + " — " + res.message);
      }
    }
    if (args.json) emitOk("archive", { verb: "restore", results, failed });
    if (failed > 0) process.exitCode = 2;
    return;
  }

  // 无参数:列出归档区(可被列出与定位)
  if (names.length === 0) {
    const archived = await listArchivedSkills(storeRoot);
    if (args.json) {
      emitOk("archive", { verb: "list", archiveDir: path.join(storeRoot, STORE_ARCHIVE_DIR), archived });
      return;
    }
    if (archived.length === 0) {
      console.log("归档区为空: " + path.join(storeRoot, STORE_ARCHIVE_DIR));
      return;
    }
    console.log("归档区(" + archived.length + "): " + path.join(storeRoot, STORE_ARCHIVE_DIR));
    for (const a of archived) console.log("  " + a.name + "  " + a.sizeBytes + " B  " + a.file);
    return;
  }

  const dryRun = args.dryRun === true;
  if (!dryRun && !requireWriteAuth(args, "archive")) return;
  const skills = await readStoreIndex(storeRoot);
  let dirNames: string[];
  try {
    dirNames = names.flatMap((n) => resolveNames(n, skills));
  } catch (e) {
    emitError(args.json === true, "archive", "not-found", e instanceof Error ? e.message : String(e));
    return;
  }

  if (dryRun) {
    const plan = dirNames.map((n) => ({
      dirName: n,
      action: "归档:打包成 zip 移入归档区,先摘全部受管链接,原件不删除",
    }));
    if (args.json) emitOk("archive", { dryRun: true, plan });
    else {
      console.log("预演(不写盘):");
      for (const p of plan) console.log("  " + p.dirName + " — " + p.action);
    }
    return;
  }

  const results: unknown[] = [];
  let failed = 0;
  for (const dirName of dirNames) {
    const res = await archiveSkill(storeRoot, dirName);
    if (res.ok) {
      results.push({ dirName, ok: true, archiveFile: res.archiveFile, sizeBytes: res.sizeBytes, removedLinks: res.removedLinks });
      console.log("✓ 已归档: " + dirName + " → " + res.archiveFile + " (" + res.removedLinks + " 个链接已摘)");
    } else {
      failed++;
      results.push({ dirName, ok: false, code: res.code, message: res.message });
      console.error("✗ 归档失败: " + dirName + " — " + res.message);
    }
  }
  if (args.json) {
    emitOk("archive", { archiveDir: path.join(storeRoot, STORE_ARCHIVE_DIR), results, failed });
  } else {
    console.log("归档完成:" + (dirNames.length - failed) + " 成功 / " + failed + " 失败。");
    console.log("本工具没有真删除。如需彻底删除,请自行处理归档区文件:" + path.join(storeRoot, STORE_ARCHIVE_DIR));
  }
  if (failed > 0) process.exitCode = 2;
}


