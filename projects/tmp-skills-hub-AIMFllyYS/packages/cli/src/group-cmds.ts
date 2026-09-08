import {
  addSkillToGroups,
  createGroup,
  deleteGroup,
  readGroups,
  readStoreIndex,
  removeSkillFromGroups,
  writeGroups,
  type SkillRecord,
} from "@skills-hub/core";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-cmds.js";
import { emitError, emitOk } from "./json-out.js";
import { resolveSkill } from "./resolve-skill.js";

/**
 * group 命令:分组的增删改查(cli-commands-v0.md §5)。
 * 分组只是视图:删除分组不删除任何 skill;写操作需 --yes;支持 --json 与 --dry-run。
 * 写路径与 HTTP 共用 performCreateGroup / performUpdateGroup / performDeleteGroup / performGroupMembers。
 */

export const GROUP_ID_RE = /^[a-z][a-z0-9-]*$/;

export interface GroupArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  name: string | undefined;
  desc: string | undefined;
  _: (string | number)[];
}

export type GroupFailCode = "bad-usage" | "group-exists" | "group-not-found" | "not-found" | "io-error";

export type GroupFail = { ok: false; code: GroupFailCode; message: string };

export type GroupCreateOk = { ok: true; id: string; name: string; description: string };
export type GroupUpdateOk = { ok: true; id: string; name: string; description: string };
export type GroupDeleteOk = { ok: true; id: string; memberCount: number };
export type GroupMembersOk = {
  ok: true;
  verb: "add" | "remove";
  id: string;
  hashes: string[];
  dirNames: string[];
  changed: number;
};

export async function performCreateGroup(
  storeRoot: string,
  input: { id: string; name?: string; description?: string },
): Promise<GroupCreateOk | GroupFail> {
  const id = input.id.trim();
  if (id === "" || !GROUP_ID_RE.test(id)) {
    return { ok: false, code: "bad-usage", message: "分组 id 须为小写字母开头、可含数字与连字符" + (id !== "" ? ": " + id : "") };
  }
  const name = input.name !== undefined && input.name.trim() !== "" ? input.name.trim() : id;
  const description = input.description ?? "";
  try {
    await createGroup(storeRoot, { id, name, description });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("已存在")) return { ok: false, code: "group-exists", message };
    return { ok: false, code: "io-error", message };
  }
  return { ok: true, id, name, description };
}

export async function performUpdateGroup(
  storeRoot: string,
  input: { id: string; name?: string; description?: string },
): Promise<GroupUpdateOk | GroupFail> {
  const id = input.id.trim();
  const name = input.name !== undefined ? input.name.trim() : undefined;
  const description = input.description;
  if ((name === undefined || name === "") && description === undefined) {
    return { ok: false, code: "bad-usage", message: "需要 name 或 description" };
  }
  const current = await readGroups(storeRoot);
  const g = current.groups.find((x) => x.id === id);
  if (g === undefined) return { ok: false, code: "group-not-found", message: "分组不存在: " + id };
  if (name !== undefined && name !== "") g.name = name;
  if (description !== undefined) g.description = description;
  await writeGroups(storeRoot, current);
  return { ok: true, id, name: g.name, description: g.description };
}

export async function performDeleteGroup(storeRoot: string, id: string): Promise<GroupDeleteOk | GroupFail> {
  try {
    const memberCount = await deleteGroup(storeRoot, id);
    return { ok: true, id, memberCount };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("不存在")) return { ok: false, code: "group-not-found", message };
    return { ok: false, code: "io-error", message };
  }
}

/** 把 needles(dirName 或唯一哈希前缀)收成成员哈希。与 resolveSkill 同口径。 */
export function resolveGroupNeedles(needles: string[], skills: SkillRecord[]): { hashes: string[]; dirNames: string[] } | GroupFail {
  const hashes: string[] = [];
  const dirNames: string[] = [];
  for (const n of needles) {
    const needle = n.trim();
    if (needle === "") return { ok: false, code: "not-found", message: "hashes 含空项" };
    const hit = resolveSkill(needle, skills);
    if (!hit.ok) {
      return { ok: false, code: hit.code === "ambiguous" ? "bad-usage" : "not-found", message: hit.message };
    }
    if (!hashes.includes(hit.skill.hash)) {
      hashes.push(hit.skill.hash);
      dirNames.push(hit.skill.dirName);
    }
  }
  return { hashes, dirNames };
}

export async function performGroupMembers(
  storeRoot: string,
  input: { id: string; needles: string[]; action: "add" | "remove" },
): Promise<GroupMembersOk | GroupFail> {
  const id = input.id.trim();
  if (id === "" || input.needles.length === 0) {
    return { ok: false, code: "bad-usage", message: "需要分组 id 与至少一个 skill" };
  }
  const current = await readGroups(storeRoot);
  if (!current.groups.some((g) => g.id === id)) {
    return { ok: false, code: "group-not-found", message: "分组不存在: " + id };
  }
  const resolved = resolveGroupNeedles(input.needles, await readStoreIndex(storeRoot));
  if ("ok" in resolved) return resolved;
  const changed =
    input.action === "add"
      ? await addSkillToGroups(storeRoot, resolved.hashes, [id])
      : await removeSkillFromGroups(storeRoot, resolved.hashes, [id]);
  return { ok: true, verb: input.action, id, hashes: resolved.hashes, dirNames: resolved.dirNames, changed };
}

export async function runGroup(args: GroupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "group");
  if (storeRoot === null) return;
  const verb = args._[0] === undefined ? "" : String(args._[0]);
  const rest = args._.slice(1).map(String);
  const dryRun = args.dryRun === true;

  switch (verb) {
    case "":
    case "list": {
      const g = await readGroups(storeRoot);
      if (args.json) {
        emitOk("group", { verb: "list", groups: g.groups });
        return;
      }
      if (g.groups.length === 0) {
        console.log("暂无分组。skills-hub group create <id> 新建。");
        return;
      }
      console.log("分组(" + g.groups.length + "):");
      for (const gr of g.groups) {
        console.log("  " + gr.id + "  [" + gr.memberHashes.length + "] " + (gr.name !== gr.id ? gr.name + " — " : "") + gr.description);
      }
      return;
    }
    case "create": {
      const id = rest[0] ?? "";
      if (id === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group create <id> [--name <名称>] [--desc <描述>]");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "create", id, name: args.name ?? id, description: args.desc ?? "" });
        else console.log("预演:将新建分组 " + id);
        return;
      }
      const input: { id: string; name?: string; description?: string } = { id };
      if (args.name !== undefined) input.name = args.name;
      if (args.desc !== undefined) input.description = args.desc;
      const result = await performCreateGroup(storeRoot, input);
      if (!result.ok) {
        emitError(args.json === true, "group", result.code, result.message);
        return;
      }
      if (args.json) emitOk("group", { verb: "create", id: result.id, name: result.name, description: result.description });
      else console.log("✓ 已创建分组: " + result.id);
      return;
    }
    case "rename": {
      const id = rest[0] ?? "";
      if (id === "" || args.name === undefined || args.name.trim() === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group rename <id> --name <新名称>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "rename", id, name: args.name });
        else console.log("预演:将重命名分组 " + id + " → " + args.name);
        return;
      }
      const result = await performUpdateGroup(storeRoot, { id, name: args.name });
      if (!result.ok) {
        emitError(args.json === true, "group", result.code, result.message);
        return;
      }
      if (args.json) emitOk("group", { verb: "rename", id: result.id, name: result.name });
      else console.log("✓ 已重命名: " + result.id + " → " + result.name);
      return;
    }
    case "delete": {
      const id = rest[0] ?? "";
      if (id === "") {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group delete <id>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        if (args.json) emitOk("group", { dryRun: true, verb: "delete", id });
        else console.log("预演:将删除分组 " + id + "(不影响任何 skill)");
        return;
      }
      const result = await performDeleteGroup(storeRoot, id);
      if (!result.ok) {
        emitError(args.json === true, "group", result.code, result.message);
        return;
      }
      if (args.json) emitOk("group", { verb: "delete", id: result.id, memberCount: result.memberCount });
      else console.log("✓ 已删除分组: " + result.id + "(成员 " + result.memberCount + " 个 skill 未受影响)");
      return;
    }
    case "add":
    case "remove": {
      const id = rest[0] ?? "";
      const names = rest.slice(1);
      if (id === "" || names.length === 0) {
        emitError(args.json === true, "group", "bad-usage", "用法: skills-hub group " + verb + " <id> <skill名...>");
        return;
      }
      if (!dryRun && !requireWriteAuth(args, "group")) return;
      if (dryRun) {
        const resolved = resolveGroupNeedles(names, await readStoreIndex(storeRoot));
        if ("ok" in resolved) {
          emitError(args.json === true, "group", resolved.code, resolved.message);
          return;
        }
        if (args.json) emitOk("group", { dryRun: true, verb, id, dirNames: resolved.dirNames, hashes: resolved.hashes });
        else console.log("预演:分组 " + id + " " + (verb === "add" ? "加入" : "移出") + ": " + resolved.dirNames.join(", "));
        return;
      }
      const result = await performGroupMembers(storeRoot, { id, needles: names, action: verb });
      if (!result.ok) {
        emitError(args.json === true, "group", result.code, result.message);
        return;
      }
      if (args.json) emitOk("group", { verb: result.verb, id: result.id, dirNames: result.dirNames, hashes: result.hashes, changed: result.changed });
      else console.log((result.verb === "add" ? "✓ 已加入分组 " : "✓ 已移出分组 ") + result.id + ": " + result.dirNames.join(", ") + "(" + result.changed + " 处变更)");
      return;
    }
    default:
      emitError(args.json === true, "group", "bad-usage", "未知子命令: " + verb + "。支持: list / create / rename / delete / add / remove");
      return;
  }
}
