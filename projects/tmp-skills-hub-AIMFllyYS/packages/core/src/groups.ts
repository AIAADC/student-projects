import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { STORE_TMP_DIR } from "./store-layout.js";

/**
 * 分组模型与持久化(#25)。
 * 分组只是视图与批量操作的单位:变更分组绝不移动库存文件;
 * 成员按 skill 哈希(确定性标识)记录,一个 skill 可属于多个分组。
 * 内置分组在库存初始化时写入,用户修改后不被覆盖(占位/缺失才补)。
 */

export const GROUPS_FILE_VERSION = 1;

export interface GroupDef {
  id: string;
  name: string;
  description: string;
  /** 成员:skill 哈希(与 SkillRecord.hash 同源) */
  memberHashes: string[];
}

export interface GroupsFile {
  version: number;
  groups: GroupDef[];
}

/** 内置分组(cli-commands-v0.md §5):初始一批常用分组。 */
export const BUILTIN_GROUPS: GroupDef[] = [
  { id: "development", name: "开发", description: "编码与工程化相关", memberHashes: [] },
  { id: "design", name: "设计", description: "界面与视觉设计相关", memberHashes: [] },
  { id: "tooling", name: "工具", description: "效率工具与脚本", memberHashes: [] },
  { id: "writing", name: "写作", description: "文档与内容创作", memberHashes: [] },
  { id: "research", name: "调研", description: "信息检索与调研", memberHashes: [] },
];

const file = (storeRoot: string): string => path.join(storeRoot, "groups.json");

function parse(raw: string, p: string): GroupsFile {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error("groups.json 损坏(无法解析): " + p, { cause: e });
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("groups.json 损坏(结构不是对象): " + p);
  }
  const obj = data as { version?: unknown; groups?: unknown };
  // init 占位 {} → 空分组
  if (obj.version === undefined && obj.groups === undefined) {
    return { version: GROUPS_FILE_VERSION, groups: [] };
  }
  if (typeof obj.version !== "number" || !Array.isArray(obj.groups)) {
    throw new Error("groups.json 版本或结构不支持: " + p);
  }
  if (obj.version > GROUPS_FILE_VERSION) {
    throw new Error("groups.json 版本过高: " + obj.version + " (当前支持 " + GROUPS_FILE_VERSION + ")，请升级 skills-hub");
  }
  return { version: GROUPS_FILE_VERSION, groups: obj.groups as GroupDef[] };
}

/** 读分组定义;缺失或占位 {} → 空分组;损坏抛错(绝不静默重置)。 */
export async function readGroups(storeRoot: string): Promise<GroupsFile> {
  let raw: string;
  try {
    raw = await readFile(file(storeRoot), "utf8");
  } catch {
    return { version: GROUPS_FILE_VERSION, groups: [] };
  }
  return parse(raw, file(storeRoot));
}

/** 原子写分组定义:先写 tmp 再 rename。 */
export async function writeGroups(storeRoot: string, groups: GroupsFile): Promise<void> {
  const target = file(storeRoot);
  const tmp = path.join(storeRoot, STORE_TMP_DIR, "groups." + process.pid + "-" + Date.now() + ".tmp");
  await writeFile(tmp, JSON.stringify({ version: GROUPS_FILE_VERSION, groups: groups.groups }, null, 2) + "\n", "utf8");
  await rename(tmp, target);
}

/**
 * 确保内置分组存在:仅当文件缺失或为 init 占位 {} 时写入;
 * 用户已修改(含删空)的分组定义绝不覆盖。
 */
export async function ensureBuiltinGroups(storeRoot: string): Promise<{ wrote: boolean }> {
  let raw: string | null = null;
  try {
    raw = await readFile(file(storeRoot), "utf8");
  } catch {
    /* 缺失 → 视为占位 */
  }
  if (raw !== null && raw.trim() !== "{}") return { wrote: false };
  await writeGroups(storeRoot, { version: GROUPS_FILE_VERSION, groups: BUILTIN_GROUPS.map((g) => ({ ...g, memberHashes: [] })) });
  return { wrote: true };
}

/** 把 skill(s) 加入若干分组(去重;已存在则跳过)。返回实际变更数。 */
export async function addSkillToGroups(storeRoot: string, skillHashes: string | string[], groupIds: string[]): Promise<number> {
  const hashes = Array.isArray(skillHashes) ? skillHashes : [skillHashes];
  let total = 0;
  for (const h of hashes) {
    const current = await readGroups(storeRoot);
    let changed = 0;
    for (const g of current.groups) {
      if (groupIds.includes(g.id) && !g.memberHashes.includes(h)) {
        g.memberHashes.push(h);
        changed++;
      }
    }
    if (changed > 0) {
      await writeGroups(storeRoot, current);
      total += changed;
    }
  }
  return total;
}

/** 把 skill(s) 移出若干分组。返回实际变更数。 */
export async function removeSkillFromGroups(storeRoot: string, skillHashes: string | string[], groupIds: string[]): Promise<number> {
  const hashes = Array.isArray(skillHashes) ? skillHashes : [skillHashes];
  let total = 0;
  for (const h of hashes) {
    const current = await readGroups(storeRoot);
    let changed = 0;
    for (const g of current.groups) {
      if (groupIds.includes(g.id)) {
        const before = g.memberHashes.length;
        g.memberHashes = g.memberHashes.filter((x) => x !== h);
        if (g.memberHashes.length !== before) changed++;
      }
    }
    if (changed > 0) {
      await writeGroups(storeRoot, current);
      total += changed;
    }
  }
  return total;
}

/** 新建分组;id 已存在则抛错。 */
export async function createGroup(storeRoot: string, def: { id: string; name: string; description: string }): Promise<void> {
  const current = await readGroups(storeRoot);
  if (current.groups.some((g) => g.id === def.id)) throw new Error("分组已存在: " + def.id);
  current.groups.push({ id: def.id, name: def.name, description: def.description, memberHashes: [] });
  await writeGroups(storeRoot, current);
}

/** 重命名分组;不存在则抛错。 */
export async function renameGroup(storeRoot: string, id: string, name: string): Promise<void> {
  const current = await readGroups(storeRoot);
  const g = current.groups.find((x) => x.id === id);
  if (g === undefined) throw new Error("分组不存在: " + id);
  g.name = name;
  await writeGroups(storeRoot, current);
}

/** 删除分组(仅删定义,不删任何 skill)。返回该组当时的成员数。 */
export async function deleteGroup(storeRoot: string, id: string): Promise<number> {
  const current = await readGroups(storeRoot);
  const g = current.groups.find((x) => x.id === id);
  if (g === undefined) throw new Error("分组不存在: " + id);
  const members = g.memberHashes.length;
  current.groups = current.groups.filter((x) => x.id !== id);
  await writeGroups(storeRoot, current);
  return members;
}

/** skill 属于哪些分组(按 id)。 */
export function groupsOfSkill(groups: GroupsFile, skillHash: string): string[] {
  return groups.groups.filter((g) => g.memberHashes.includes(skillHash)).map((g) => g.id);
}

/** 某分组下的全部 skill 哈希。 */
export function skillsOfGroup(groups: GroupsFile, groupId: string): string[] {
  const g = groups.groups.find((x) => x.id === groupId);
  return g === undefined ? [] : [...g.memberHashes];
}
