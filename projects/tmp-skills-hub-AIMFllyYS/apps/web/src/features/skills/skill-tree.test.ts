import { describe, expect, it } from "vitest";
import {
  collectDirPaths,
  countFiles,
  fileTint,
  formatBytes,
  originLabel,
  totalSizeBytes,
  treeFromEntries,
} from "./skill-tree.js";
import type { SkillFileEntry } from "./types.js";

function file(path: string, size = 1): SkillFileEntry {
  return { path, kind: "file", sizeBytes: size };
}
function dir(path: string): SkillFileEntry {
  return { path, kind: "dir", sizeBytes: 0 };
}

describe("treeFromEntries", () => {
  it("根文件与子目录分层,目录排在文件前", () => {
    const tree = treeFromEntries([
      file("SKILL.md", 10),
      file("scripts/helpers.js", 2),
      file("scripts/build.js", 3),
      dir("scripts"),
      file("references/notes.md", 4),
    ]);
    expect(tree.map((n) => n.name)).toEqual(["references", "scripts", "SKILL.md"]);
    expect(tree[1]!.children.map((c) => c.name)).toEqual(["build.js", "helpers.js"]);
    expect(collectDirPaths(tree)).toEqual(["references", "scripts"]);
  });

  it("没有 dir 记录时仍能从文件 path 造出父目录", () => {
    const tree = treeFromEntries([file("a/b/c.txt")]);
    expect(tree[0]!.path).toBe("a");
    expect(tree[0]!.children[0]!.path).toBe("a/b");
    expect(tree[0]!.children[0]!.children[0]!.path).toBe("a/b/c.txt");
  });
});

describe("tree stats", () => {
  it("countFiles / totalSizeBytes 只计文件", () => {
    const entries = [file("SKILL.md", 10), dir("scripts"), file("scripts/a.js", 5)];
    expect(countFiles(entries)).toBe(2);
    expect(totalSizeBytes(entries)).toBe(15);
    expect(formatBytes(10)).toBe("10 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("originLabel 空则未标记", () => {
    expect(originLabel([])).toBe("未标记");
    expect(originLabel([{ kind: "github", reference: "x" }])).toBe("github");
  });

  it("fileTint 按扩展名", () => {
    expect(fileTint("docs", "dir")).toBe("folder");
    expect(fileTint("SKILL.md", "file")).toBe("md");
    expect(fileTint("a.json", "file")).toBe("json");
    expect(fileTint("a.ts", "file")).toBe("code");
    expect(fileTint("a.png", "file")).toBe("other");
  });
});
