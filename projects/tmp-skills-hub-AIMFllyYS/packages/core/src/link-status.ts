import { readdir } from "node:fs/promises";
import path from "node:path";
import { inspectClientPath, type DanglingLink } from "./link-probe.js";

export type ClientLinkState = "managed" | "off" | "unregistered-conflict" | "dangling";

export interface ClientLinkStatus {
  state: ClientLinkState;
  detail: string;
}

/**
 * 只读判定一个客户端落点相对某 skill 名的状态(D5)。
 * inLedger = 台账里有该 client × entryName。
 * doctor、面板开关、预演共用本函数,不另发明枚举。
 */
export async function classifyClientLink(dest: string, inLedger: boolean): Promise<ClientLinkStatus> {
  const disk = await inspectClientPath(dest);
  if (disk.kind === "missing") {
    if (inLedger) return { state: "dangling", detail: "台账有记录但落点已不存在" };
    return { state: "off", detail: "未启用" };
  }
  if (disk.kind === "not-link") {
    return { state: "unregistered-conflict", detail: "落点被用户目录占用,绝不覆盖" };
  }
  if (disk.kind === "dead-link") {
    return { state: "dangling", detail: "链接目标已不存在" };
  }
  if (inLedger) return { state: "managed", detail: "受管链接" };
  return { state: "unregistered-conflict", detail: "落点已存在且台账未登记,绝不覆盖" };
}

function destKey(p: string): string {
  return path.resolve(p);
}

/**
 * 扫描客户端 skills 根(及可选台账落点),用 classifyClientLink 收集 dangling。
 * 用户目录占名 → unregistered-conflict,不进本列表。
 */
export async function findDanglingLinks(
  roots: string[],
  ledger: ReadonlyArray<{ targetDir: string; entryName: string }> = [],
): Promise<DanglingLink[]> {
  const dests = new Map<string, { root: string; inLedger: boolean }>();
  const add = (root: string, dest: string, inLedger: boolean): void => {
    const key = destKey(dest);
    const prev = dests.get(key);
    dests.set(key, { root: prev?.root ?? root, inLedger: Boolean(prev?.inLedger) || inLedger });
  };

  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const dest = path.join(root, entry.name);
      const inLedger = ledger.some((e) => destKey(path.join(e.targetDir, e.entryName)) === destKey(dest));
      add(root, dest, inLedger);
    }
  }
  for (const e of ledger) {
    add(e.targetDir, path.join(e.targetDir, e.entryName), true);
  }

  const dangling: DanglingLink[] = [];
  for (const [dest, meta] of dests) {
    const status = await classifyClientLink(dest, meta.inLedger);
    if (status.state !== "dangling") continue;
    const disk = await inspectClientPath(dest);
    dangling.push({ root: meta.root, linkPath: dest, target: disk.target ?? "" });
  }
  return dangling;
}
