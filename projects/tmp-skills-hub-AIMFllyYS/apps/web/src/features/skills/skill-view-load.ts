import { isAbortError } from "./async-resource.js";
import type { SkillFileEntry } from "./types.js";

/** 优先 SKILL.md,否则第一个文件;没有任何文件时返回空串。 */
export function pickInitialFile(entries: SkillFileEntry[]): string {
  const md = entries.find((x) => x.path === "SKILL.md");
  if (md !== undefined) return "SKILL.md";
  return entries.find((x) => x.kind === "file")?.path ?? "";
}

export type SkillViewLoadResult =
  | { status: "cancelled" }
  | { status: "tree-error"; message: string }
  | { status: "empty"; entries: SkillFileEntry[] }
  | { status: "file-error"; entries: SkillFileEntry[]; selected: string; message: string }
  | { status: "ok"; entries: SkillFileEntry[]; selected: string; content: string };

export interface SkillViewLoadDeps {
  fetchTree: (hash: string) => Promise<SkillFileEntry[]>;
  fetchFile: (hash: string, path: string) => Promise<{ content: string }>;
  isCancelled: () => boolean;
}

/**
 * 拉树并自动加载首个文件。hash 切换或卸载后到达的响应必须丢弃。
 */
export async function loadSkillView(hash: string, deps: SkillViewLoadDeps): Promise<SkillViewLoadResult> {
  let entries: SkillFileEntry[];
  try {
    entries = await deps.fetchTree(hash);
  } catch (e) {
    if (deps.isCancelled() || isAbortError(e)) return { status: "cancelled" };
    return { status: "tree-error", message: e instanceof Error ? e.message : String(e) };
  }
  if (deps.isCancelled()) return { status: "cancelled" };
  const selected = pickInitialFile(entries);
  if (selected === "") return { status: "empty", entries };
  try {
    const file = await deps.fetchFile(hash, selected);
    if (deps.isCancelled()) return { status: "cancelled" };
    return { status: "ok", entries, selected, content: file.content };
  } catch (e) {
    if (deps.isCancelled() || isAbortError(e)) return { status: "cancelled" };
    return {
      status: "file-error",
      entries,
      selected,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
