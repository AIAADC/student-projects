import path from "node:path";
import {
  applyLinkSet,
  classifyClientLink,
  readLinksLedger,
  readStoreIndex,
  recordUsage,
  type LinkEntry,
} from "@skills-hub/core";

/**
 * enable/disable 的共享执行层:CLI 命令(store-cmds)与本地服务(ui-server)共用同一套
 * 台账计算 + 原子集合切换 + 调用计数,行为不漂移。
 * visibleIn 不写回 index;JSON 边界按台账推导。
 * 错误通过结构化返回值表达(不发散到 CLI 的 stderr / HTTP 状态码)。
 */

export interface LinkChangeRequest {
  storeRoot: string;
  clientId: string;
  /** global(默认,home 下)/ project(cwd 下) */
  scope: "global" | "project";
  skillsDir: string;
  dirNames: string[];
}

export type LinkChangeResult =
  | { ok: true; created: string[]; removed: string[] }
  | { ok: false; code: "link-failed"; message: string; conflicts?: LinkConflictItem[] };

export interface LinkDiffItem {
  hash: string;
  dirName: string;
  clientId: string;
  dest: string;
}

export interface LinkConflictItem extends LinkDiffItem {
  at: string;
  reason: string;
  code: string;
}

export interface LinkPreview {
  clientId: string;
  skillsDir: string;
  wouldCreate: LinkDiffItem[];
  wouldRemove: LinkDiffItem[];
  conflicts: LinkConflictItem[];
}

/**
 * 执行一次链接集合切换:enable = 集合切换为「保留未点名 + 新增点名」;
 * disable = 集合切换为「排除点名」。成功后(enable 时)计数。visibleIn 不写 index。
 * 返回结构化结果;unregistered-conflict / not-link-conflict 由调用方决定如何呈现。
 */
export async function performLinkChange(
  req: LinkChangeRequest,
  action: "enable" | "disable",
): Promise<LinkChangeResult> {
  const { storeRoot, clientId, scope, skillsDir, dirNames } = req;
  const skills = await readStoreIndex(storeRoot);
  const ledger = await readLinksLedger(storeRoot);
  const existing = ledger.filter((e) => e.targetDir === skillsDir);
  const kind = process.platform === "win32" ? "junction" : "symlink";
  const now = new Date().toISOString();

  let desired: LinkEntry[];
  if (action === "enable") {
    const planNames = new Set(dirNames);
    const keep = existing.filter((e) => !planNames.has(e.entryName));
    desired = [
      ...keep,
      ...dirNames.map((name) => {
        const record = skills.find((s) => s.dirName === name)!;
        const prev = existing.find((e) => e.entryName === name);
        return {
          id: prev?.id ?? clientId + ":" + scope + ":" + name,
          clientId,
          scope,
          targetDir: skillsDir,
          entryName: name,
          skillHash: record.hash,
          kind: prev?.kind ?? kind,
          createdAt: prev?.createdAt ?? now,
        } satisfies LinkEntry;
      }),
    ];
  } else {
    const drop = new Set(dirNames);
    desired = existing.filter((e) => !drop.has(e.entryName));
  }

  const result = await applyLinkSet(storeRoot, { targetDir: skillsDir, entries: desired });
  if (!result.ok) {
    const extra =
      result.code === "unregistered-conflict"
        ? "落点被用户自己的目录占据且台账未登记 — 绝不覆盖,请人工处理。"
        : result.code === "not-link-conflict"
          ? "台账条目落点已被用户替换为非链接 — 绝不触碰,请人工处理。"
          : "";
    return { ok: false, code: "link-failed", message: result.message + (extra !== "" ? " " + extra : "") };
  }
  // #27:enable 真实生效才计数(预演模式在 applyLinkSet 前已返回,不计数)
  if (action === "enable") {
    for (const p of result.created) {
      const name = path.basename(p);
      const record = skills.find((s) => s.dirName === name);
      if (record !== undefined) await recordUsage(storeRoot, record.hash, "enable").catch(() => undefined);
    }
  }
  return { ok: true, created: result.created, removed: result.removed };
}

/** 不写盘的 diff:将新增 / 将摘除 / 冲突(含 at 与原因)。 */
export async function previewLinkChange(
  req: LinkChangeRequest,
  action: "enable" | "disable",
): Promise<LinkPreview> {
  const skills = await readStoreIndex(req.storeRoot);
  const ledger = await readLinksLedger(req.storeRoot);
  const wouldCreate: LinkDiffItem[] = [];
  const wouldRemove: LinkDiffItem[] = [];
  const conflicts: LinkConflictItem[] = [];
  for (const name of req.dirNames) {
    const record = skills.find((s) => s.dirName === name);
    if (record === undefined) continue;
    const dest = path.join(req.skillsDir, name);
    const inLedger = ledger.some((e) => e.clientId === req.clientId && e.entryName === name);
    const status = await classifyClientLink(dest, inLedger);
    const item: LinkDiffItem = { hash: record.hash, dirName: name, clientId: req.clientId, dest };
    if (action === "enable") {
      if (status.state === "managed") continue;
      if (status.state === "off" || status.state === "dangling") {
        wouldCreate.push(item);
        continue;
      }
      conflicts.push({ ...item, at: dest, reason: status.detail, code: status.state });
    } else {
      if (status.state === "off") continue;
      if (status.state === "managed" || status.state === "dangling") {
        wouldRemove.push(item);
        continue;
      }
      conflicts.push({ ...item, at: dest, reason: status.detail, code: status.state });
    }
  }
  return { clientId: req.clientId, skillsDir: req.skillsDir, wouldCreate, wouldRemove, conflicts };
}

/**
 * 按落点各调用一次 applyLinkSet。任一失败则对已成功的落点做反向切换,整单回到变更前。
 */
export async function applyLinkBatch(
  items: LinkChangeRequest[],
  action: "enable" | "disable",
): Promise<LinkChangeResult> {
  const allConflicts: LinkConflictItem[] = [];
  for (const req of items) {
    const preview = await previewLinkChange(req, action);
    allConflicts.push(...preview.conflicts);
  }
  if (allConflicts.length > 0) {
    return {
      ok: false,
      code: "link-failed",
      message: "预检到 " + String(allConflicts.length) + " 处冲突,未写盘。",
      conflicts: allConflicts,
    };
  }
  const created: string[] = [];
  const removed: string[] = [];
  const done: LinkChangeRequest[] = [];
  for (const req of items) {
    const result = await performLinkChange(req, action);
    if (!result.ok) {
      for (const prev of [...done].reverse()) {
        await performLinkChange(prev, action === "enable" ? "disable" : "enable");
      }
      return result;
    }
    created.push(...result.created);
    removed.push(...result.removed);
    done.push(req);
  }
  return { ok: true, created, removed };
}
