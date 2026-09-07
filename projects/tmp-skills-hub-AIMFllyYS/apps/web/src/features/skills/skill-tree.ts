import type { SkillFileEntry } from "./types.js";

export interface SkillTreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  sizeBytes: number;
  children: SkillTreeNode[];
}

function sortNodes(nodes: SkillTreeNode[]): void {
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const n of nodes) sortNodes(n.children);
}

/** 把扁平 path 收成可折叠树。不改 tree API。 */
export function treeFromEntries(entries: readonly SkillFileEntry[]): SkillTreeNode[] {
  const root: SkillTreeNode[] = [];
  const dirs = new Map<string, SkillTreeNode>();

  const ensureDir = (dirPath: string): SkillTreeNode => {
    const existing = dirs.get(dirPath);
    if (existing !== undefined) return existing;
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1] ?? dirPath;
    const node: SkillTreeNode = { name, path: dirPath, kind: "dir", sizeBytes: 0, children: [] };
    dirs.set(dirPath, node);
    if (parts.length === 1) root.push(node);
    else ensureDir(parts.slice(0, -1).join("/")).children.push(node);
    return node;
  };

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  for (const e of sorted) {
    const parts = e.path.split("/");
    if (e.kind === "dir") {
      ensureDir(e.path).sizeBytes = e.sizeBytes;
      continue;
    }
    const file: SkillTreeNode = {
      name: parts[parts.length - 1] ?? e.path,
      path: e.path,
      kind: "file",
      sizeBytes: e.sizeBytes,
      children: [],
    };
    if (parts.length === 1) root.push(file);
    else ensureDir(parts.slice(0, -1).join("/")).children.push(file);
  }
  sortNodes(root);
  return root;
}

export function collectDirPaths(nodes: readonly SkillTreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly SkillTreeNode[]): void => {
    for (const n of list) {
      if (n.kind === "dir") {
        out.push(n.path);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

export function countFiles(entries: readonly SkillFileEntry[]): number {
  return entries.filter((e) => e.kind === "file").length;
}

export function totalSizeBytes(entries: readonly SkillFileEntry[]): number {
  return entries.filter((e) => e.kind === "file").reduce((s, e) => s + e.sizeBytes, 0);
}

export function formatBytes(n: number): string {
  if (n < 1024) return String(n) + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  return (n / (1024 * 1024)).toFixed(1) + " MB";
}

export function formatInstalledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

export function originLabel(origins: readonly { kind: string; reference: string }[]): string {
  if (origins.length === 0) return "未标记";
  const kinds = [...new Set(origins.map((o) => o.kind || "未标记"))];
  return kinds.join(" · ");
}

export type FileTint = "folder" | "md" | "json" | "code" | "other";

export function fileTint(path: string, kind: "file" | "dir"): FileTint {
  if (kind === "dir") return "folder";
  const lower = path.toLowerCase();
  if (lower.endsWith(".md")) return "md";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs") || lower.endsWith(".ts") || lower.endsWith(".tsx")) {
    return "code";
  }
  return "other";
}

export function fileTintClass(tint: FileTint): string {
  if (tint === "folder") return "text-amber-700";
  if (tint === "md") return "text-blue-600";
  if (tint === "json") return "text-orange-600";
  if (tint === "code") return "text-teal-700";
  return "text-ink-mid";
}
