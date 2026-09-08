import type { LinksPreviewResponse } from "./types.js";

/** 从预览里抽出可以安全提交的 hash(笛卡尔 API 不能夹带冲突对)。 */
export function hashesForApply(
  preview: LinksPreviewResponse,
  action: "enable" | "disable",
): { hashes: string[]; skipped: number } {
  const items = action === "enable" ? preview.wouldCreate : preview.wouldRemove;
  return { hashes: uniqueHashes(items), skipped: preview.conflictCount };
}

/** 按客户端切开,供「启用到全部应用」逐个落点提交。 */
export function hashesByClient(
  preview: LinksPreviewResponse,
  action: "enable" | "disable",
): Map<string, string[]> {
  const items = action === "enable" ? preview.wouldCreate : preview.wouldRemove;
  const map = new Map<string, string[]>();
  for (const item of items) {
    const list = map.get(item.clientId) ?? [];
    if (!list.includes(item.hash)) list.push(item.hash);
    map.set(item.clientId, list);
  }
  return map;
}

export function formatBatchResult(
  action: "enable" | "disable",
  created: number,
  removed: number,
  skipped: number,
): string {
  const main = action === "enable"
    ? (created === 0 ? "没有新增启用" : "已启用 " + String(created) + " 条链接")
    : (removed === 0 ? "没有摘除链接" : "已停用 " + String(removed) + " 条链接");
  const skippedPart = skipped === 0 ? "" : "；跳过占用 " + String(skipped) + " 处";
  const diskNote = action === "enable" && created > 0
    ? "。磁盘已改；正在运行的应用可能仍要新开对话。"
    : "";
  return main + skippedPart + diskNote;
}

function uniqueHashes(items: ReadonlyArray<{ hash: string }>): string[] {
  const out: string[] = [];
  for (const item of items) {
    if (!out.includes(item.hash)) out.push(item.hash);
  }
  return out;
}
