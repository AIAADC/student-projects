import { describe, expect, it } from "vitest";
import { loadSkillView, pickInitialFile } from "./skill-view-load.js";
import type { SkillFileEntry } from "./types.js";

function file(path: string): SkillFileEntry {
  return { path, kind: "file", sizeBytes: 1 };
}

function dir(path: string): SkillFileEntry {
  return { path, kind: "dir", sizeBytes: 0 };
}

describe("pickInitialFile", () => {
  it("优先 SKILL.md", () => {
    expect(pickInitialFile([file("README.md"), file("SKILL.md")])).toBe("SKILL.md");
  });

  it("没有 SKILL.md 时取第一个文件", () => {
    expect(pickInitialFile([dir("scripts"), file("notes.md")])).toBe("notes.md");
  });

  it("没有任何文件时返回空串", () => {
    expect(pickInitialFile([dir("scripts")])).toBe("");
    expect(pickInitialFile([])).toBe("");
  });
});

describe("loadSkillView", () => {
  it("挂载后自动加载首个文件", async () => {
    const fetched: string[] = [];
    const result = await loadSkillView("abc", {
      fetchTree: async () => [file("SKILL.md"), file("extra.md")],
      fetchFile: async (hash, path) => {
        fetched.push(hash + ":" + path);
        return { content: "# hello " + hash };
      },
      isCancelled: () => false,
    });
    expect(result).toEqual({
      status: "ok",
      entries: [file("SKILL.md"), file("extra.md")],
      selected: "SKILL.md",
      content: "# hello abc",
    });
    expect(fetched).toEqual(["abc:SKILL.md"]);
  });

  it("空 skill 返回 empty,不假装还在加载", async () => {
    const result = await loadSkillView("empty", {
      fetchTree: async () => [dir("bin")],
      fetchFile: async () => {
        throw new Error("不应去拉文件");
      },
      isCancelled: () => false,
    });
    expect(result).toEqual({ status: "empty", entries: [dir("bin")] });
  });

  it("读取失败返回可读原因", async () => {
    const result = await loadSkillView("bad", {
      fetchTree: async () => [file("SKILL.md")],
      fetchFile: async () => {
        throw new Error("文件过大(超过 512 KB)");
      },
      isCancelled: () => false,
    });
    expect(result).toEqual({
      status: "file-error",
      entries: [file("SKILL.md")],
      selected: "SKILL.md",
      message: "文件过大(超过 512 KB)",
    });
  });

  it("hash 切换时丢弃旧树响应", async () => {
    let release!: (entries: SkillFileEntry[]) => void;
    const tree = new Promise<SkillFileEntry[]>((resolve) => {
      release = resolve;
    });
    let cancelled = false;
    const pending = loadSkillView("old", {
      fetchTree: async () => tree,
      fetchFile: async () => ({ content: "stale" }),
      isCancelled: () => cancelled,
    });
    cancelled = true;
    release([file("SKILL.md")]);
    expect(await pending).toEqual({ status: "cancelled" });
  });

  it("hash 切换时丢弃旧文件响应", async () => {
    let release!: (content: { content: string }) => void;
    const fileP = new Promise<{ content: string }>((resolve) => {
      release = resolve;
    });
    let cancelled = false;
    const pending = loadSkillView("old", {
      fetchTree: async () => [file("SKILL.md")],
      fetchFile: async () => fileP,
      isCancelled: () => cancelled,
    });
    cancelled = true;
    release({ content: "stale body" });
    expect(await pending).toEqual({ status: "cancelled" });
  });
});
