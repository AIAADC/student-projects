/**
 * Agent 一等工具(agent-v0.md §4):直调 perform* / core,不 spawn CLI。
 * execute 失败返回 { ok:false, message },不 throw。
 */

import path from "node:path";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  archiveSkill,
  attachVisibleIn,
  listArchivedSkills,
  listBackupSnapshots,
  readGroups,
  readLinksLedger,
  readSkillFile,
  readStoreIndex,
  restoreArchivedSkill,
  saveSkillFile,
  STORE_SKILLS_DIR,
} from "@skills-hub/core";
import type { AnalyzeGenerate } from "../analyze.js";
import { performAnalyze } from "../analyze.js";
import { performAllocate, performCommit, performDiscard } from "../create-cmds.js";
import { collectDoctorReport } from "../doctor.js";
import {
  performCreateGroup,
  performDeleteGroup,
  performGroupMembers,
  performUpdateGroup,
} from "../group-cmds.js";
import { performLinkChange } from "../link-actions.js";
import { resolveSkill } from "../resolve-skill.js";
import { scanKnownClients } from "../scan.js";
import { performShare } from "../share.js";
import { performAdopt, performVerify } from "../store-cmds.js";
import { resolveClientSkillsDirAt } from "../ui-http.js";

export const TOOL_OUTPUT_LIMIT = 24_000;

export const WRITE_TOOL_NAMES: ReadonlySet<string> = new Set([
  "enable_skills",
  "disable_skills",
  "adopt_skill",
  "archive_skill",
  "restore_archived",
  "share_skill",
  "create_draft",
  "commit_draft",
  "discard_draft",
  "write_skill_file",
  "group_create",
  "group_update",
  "group_delete",
  "group_members",
]);

export interface ToolEnv {
  home: string;
  storeRoot: string | null;
  fetchImpl?: typeof fetch;
  analyzeGenerate?: AnalyzeGenerate;
}

function clip(text: string): string {
  return text.length > TOOL_OUTPUT_LIMIT ? text.slice(0, TOOL_OUTPUT_LIMIT) + "\n[输出已截断]" : text;
}

function dump(data: unknown): unknown {
  const text = JSON.stringify(data);
  if (text.length <= TOOL_OUTPUT_LIMIT) return data;
  return { ok: false, message: clip(text) };
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function needStore(env: ToolEnv): string | { ok: false; message: string } {
  if (env.storeRoot === null) return fail("库存未配置:先运行 skills-hub init。");
  return env.storeRoot;
}

async function resolveDirName(root: string, target: string): Promise<string | { ok: false; message: string }> {
  const hit = resolveSkill(target.trim(), await readStoreIndex(root));
  if (!hit.ok) return fail(hit.message);
  return hit.skill.dirName;
}

async function resolveDirNames(root: string, targets: string[]): Promise<string[] | { ok: false; message: string }> {
  const names: string[] = [];
  for (const t of targets) {
    const one = await resolveDirName(root, t);
    if (typeof one !== "string") return one;
    if (!names.includes(one)) names.push(one);
  }
  return names;
}

async function linkChange(
  env: ToolEnv,
  action: "enable" | "disable",
  targets: string[],
  clientId: string,
  scope: "global" | "project",
): Promise<unknown> {
  const root = needStore(env);
  if (typeof root !== "string") return root;
  const dirNames = await resolveDirNames(root, targets);
  if (!Array.isArray(dirNames)) return dirNames;
  const client = await resolveClientSkillsDirAt(env.home, clientId, scope, root);
  if (client === null) return fail("未发现客户端: " + clientId);
  const result = await performLinkChange(
    { storeRoot: root, clientId: client.clientId, scope, skillsDir: client.skillsDir, dirNames },
    action,
  );
  return dump(result);
}

export function createAgentTools(env: ToolEnv): ToolSet {
  return {
    list_skills: tool({
      description: "列出库存全部 skill(dirName、hash 前缀、描述、已启用客户端)",
      inputSchema: z.object({}),
      execute: async () => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const skills = attachVisibleIn(await readStoreIndex(root), await readLinksLedger(root));
        return dump(
          skills.map((s) => ({
            dirName: s.dirName,
            hash: s.hash.slice(0, 12),
            description: s.meta.description.slice(0, 200),
            visibleIn: s.visibleIn,
          })),
        );
      },
    }),
    show_skill: tool({
      description: "查看单个 skill 详情。target 为 dirName 或唯一 hash 前缀。",
      inputSchema: z.object({ target: z.string() }),
      execute: async ({ target }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const hit = resolveSkill(target, attachVisibleIn(await readStoreIndex(root), await readLinksLedger(root)));
        if (!hit.ok) return fail(hit.message);
        return dump(hit.skill);
      },
    }),
    scan_clients: tool({
      description: "扫描各客户端目录里已有的 skill,只读不入库。",
      inputSchema: z.object({}),
      execute: async () => {
        const found = await scanKnownClients(env.home);
        return dump(
          found.map((s) => ({
            clientId: s.clientId,
            name: s.meta.name,
            description: s.meta.description.slice(0, 200),
            hash: s.hash.slice(0, 12),
          })),
        );
      },
    }),
    read_skill_file: tool({
      description: "读取库存中某个 skill 的文件内容,如 SKILL.md。",
      inputSchema: z.object({ target: z.string(), path: z.string() }),
      execute: async ({ target, path: rel }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const dirName = await resolveDirName(root, target);
        if (typeof dirName !== "string") return dirName;
        const res = await readSkillFile(path.join(root, STORE_SKILLS_DIR, dirName), rel);
        if (!res.ok) return fail(res.message);
        return { ok: true, path: rel, content: clip(res.content) };
      },
    }),
    list_groups: tool({
      description: "列出分组定义与成员哈希。",
      inputSchema: z.object({}),
      execute: async () => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await readGroups(root));
      },
    }),
    list_archive: tool({
      description: "列出归档区(软删除)的 skill。",
      inputSchema: z.object({}),
      execute: async () => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await listArchivedSkills(root));
      },
    }),
    list_backups: tool({
      description: "列出备份快照。",
      inputSchema: z.object({}),
      execute: async () => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await listBackupSnapshots(root));
      },
    }),
    doctor: tool({
      description: "环境自检:库存可达性、客户端 root、链接能力、悬空链接。",
      inputSchema: z.object({}),
      execute: async () => dump(await collectDoctorReport(env.home, env.storeRoot)),
    }),
    verify: tool({
      description: "重算库存哈希,报告漂移。",
      inputSchema: z.object({}),
      execute: async () => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await performVerify(root));
      },
    }),
    analyze_skill: tool({
      description: "相近/冲突分析建议,只读不写盘。",
      inputSchema: z.object({ target: z.string() }),
      execute: async ({ target }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const opts = env.analyzeGenerate !== undefined ? { generate: env.analyzeGenerate } : {};
        return dump(await performAnalyze(root, target, opts));
      },
    }),
    enable_skills: tool({
      description: "给指定客户端启用 skill(建链接)。",
      inputSchema: z.object({
        targets: z.array(z.string()).min(1),
        clientId: z.string(),
        scope: z.enum(["global", "project"]).optional(),
      }),
      execute: async ({ targets, clientId, scope }) =>
        linkChange(env, "enable", targets, clientId, scope === "project" ? "project" : "global"),
    }),
    disable_skills: tool({
      description: "给指定客户端停用 skill(摘链接,原件保留)。",
      inputSchema: z.object({
        targets: z.array(z.string()).min(1),
        clientId: z.string(),
        scope: z.enum(["global", "project"]).optional(),
      }),
      execute: async ({ targets, clientId, scope }) =>
        linkChange(env, "disable", targets, clientId, scope === "project" ? "project" : "global"),
    }),
    adopt_skill: tool({
      description: "收录本地路径或 GitHub / skills.sh URL 进库存。",
      inputSchema: z.object({ source: z.string() }),
      execute: async ({ source }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const adoptOpts = env.fetchImpl !== undefined ? { fetchImpl: env.fetchImpl } : {};
        const res = await performAdopt(root, [source], adoptOpts);
        if (res.fetchFailed) return fail(res.fetchMessage ?? "拉取失败");
        return dump({
          ok: true,
          adopted: res.adopted,
          duplicates: res.duplicates,
          conflicts: res.conflicts,
          invalid: res.invalid,
          outcomes: res.outcomes,
        });
      },
    }),
    archive_skill: tool({
      description: "软删除:移出活跃区并归档为 zip。",
      inputSchema: z.object({ target: z.string() }),
      execute: async ({ target }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const dirName = await resolveDirName(root, target);
        if (typeof dirName !== "string") return dirName;
        return dump(await archiveSkill(root, dirName));
      },
    }),
    restore_archived: tool({
      description: "从归档区恢复到活跃区(不恢复链接)。",
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await restoreArchivedSkill(root, name));
      },
    }),
    share_skill: tool({
      description: "把库存 skill 推到授信 GitHub 仓库。",
      inputSchema: z.object({ target: z.string(), repo: z.string().optional() }),
      execute: async ({ target, repo }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const shareOpts: { dryRun: false; fetchImpl?: typeof fetch; repo?: string } = { dryRun: false };
        if (env.fetchImpl !== undefined) shareOpts.fetchImpl = env.fetchImpl;
        if (repo !== undefined && repo.trim() !== "") shareOpts.repo = repo.trim();
        return dump(await performShare(root, target, shareOpts));
      },
    }),
    create_draft: tool({
      description: "在库存内占名写模板草稿。不要求 --yes。",
      inputSchema: z.object({ dirName: z.string(), description: z.string().optional() }),
      execute: async ({ dirName, description }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const seed = description !== undefined && description.trim() !== "" ? { description: description.trim() } : {};
        return dump(await performAllocate(root, dirName, seed));
      },
    }),
    commit_draft: tool({
      description: "草稿定稿入正式清单。",
      inputSchema: z.object({ dirName: z.string() }),
      execute: async ({ dirName }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await performCommit(root, dirName));
      },
    }),
    discard_draft: tool({
      description: "放弃草稿,移入归档区。",
      inputSchema: z.object({ dirName: z.string() }),
      execute: async ({ dirName }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await performDiscard(root, dirName));
      },
    }),
    write_skill_file: tool({
      description: "写回库存 skill 内的文本文件。内容变则产生新哈希。",
      inputSchema: z.object({ target: z.string(), path: z.string(), content: z.string() }),
      execute: async ({ target, path: rel, content }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const dirName = await resolveDirName(root, target);
        if (typeof dirName !== "string") return dirName;
        const res = await saveSkillFile({
          storeRoot: root,
          skillDir: path.join(root, STORE_SKILLS_DIR, dirName),
          relPath: rel,
          content,
        });
        if (!res.ok) return fail(res.message);
        return dump({ ok: true, path: rel, hash: res.newHash });
      },
    }),
    group_create: tool({
      description: "创建分组。",
      inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional() }),
      execute: async ({ id, name, description }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const payload: { id: string; name?: string; description?: string } = { id };
        if (name !== undefined) payload.name = name;
        if (description !== undefined) payload.description = description;
        return dump(await performCreateGroup(root, payload));
      },
    }),
    group_update: tool({
      description: "重命名或改分组描述。",
      inputSchema: z.object({ id: z.string(), name: z.string().optional(), description: z.string().optional() }),
      execute: async ({ id, name, description }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        const payload: { id: string; name?: string; description?: string } = { id };
        if (name !== undefined) payload.name = name;
        if (description !== undefined) payload.description = description;
        return dump(await performUpdateGroup(root, payload));
      },
    }),
    group_delete: tool({
      description: "删除分组定义,不删 skill。",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await performDeleteGroup(root, id));
      },
    }),
    group_members: tool({
      description: "向分组添加或移除 skill。",
      inputSchema: z.object({
        id: z.string(),
        targets: z.array(z.string()).min(1),
        action: z.enum(["add", "remove"]),
      }),
      execute: async ({ id, targets, action }) => {
        const root = needStore(env);
        if (typeof root !== "string") return root;
        return dump(await performGroupMembers(root, { id, needles: targets, action }));
      },
    }),
  };
}
