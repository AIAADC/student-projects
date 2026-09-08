import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readTranslation, TRANSLATIONS_DIR, translationFilePath, writeTranslation } from "../src/translations.js";

/** 译文缓存(#208):路径安全 + 读写往返。全部临时目录,不触真实库存。 */

const HASH = "ab12cd34ef56";

describe("translationFilePath 路径安全", () => {
  const root = "/fake/store";

  it("合法哈希 + 相对路径:落在 translations/<hash>/ 之内", () => {
    const p = translationFilePath(root, HASH, "SKILL.md");
    expect(p).toBe(path.resolve(root, TRANSLATIONS_DIR, HASH, "SKILL.md"));
    const nested = translationFilePath(root, HASH, "docs/a.md");
    expect(nested).toBe(path.resolve(root, TRANSLATIONS_DIR, HASH, "docs", "a.md"));
  });

  it("穿越与绝对路径一律拒绝", () => {
    expect(translationFilePath(root, HASH, "../evil.md")).toBeNull();
    expect(translationFilePath(root, HASH, "a/../../evil.md")).toBeNull();
    expect(translationFilePath(root, HASH, "/abs.md")).toBeNull();
    expect(translationFilePath(root, HASH, "")).toBeNull();
    expect(translationFilePath(root, HASH, "a\0b.md")).toBeNull();
  });

  it("非法哈希目录名拒绝(防注入)", () => {
    expect(translationFilePath(root, "../x", "SKILL.md")).toBeNull();
    expect(translationFilePath(root, "not-hex!", "SKILL.md")).toBeNull();
    expect(translationFilePath(root, "", "SKILL.md")).toBeNull();
  });
});

describe("readTranslation / writeTranslation 往返", () => {
  it("写入后可按同键读回;绝不触碰 skills/ 目录", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-trans-"));
    const res = await writeTranslation(storeRoot, HASH, "SKILL.md", "# 译文");
    expect(res.ok).toBe(true);
    const back = await readTranslation(storeRoot, HASH, "SKILL.md");
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.content).toBe("# 译文");
    // 落盘位置在 translations/ 下,不在 skills/ 下
    const onDisk = await readFile(path.join(storeRoot, TRANSLATIONS_DIR, HASH, "SKILL.md"), "utf8");
    expect(onDisk).toBe("# 译文");
  });

  it("未命中 → translation-not-found;路径非法 → bad-usage", async () => {
    const storeRoot = await mkdtemp(path.join(os.tmpdir(), "skills-hub-trans-miss-"));
    const miss = await readTranslation(storeRoot, HASH, "SKILL.md");
    expect(miss.ok).toBe(false);
    if (!miss.ok) expect(miss.code).toBe("translation-not-found");
    const bad = await readTranslation(storeRoot, HASH, "../x.md");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("bad-usage");
    const badWrite = await writeTranslation(storeRoot, "../x", "a.md", "x");
    expect(badWrite.ok).toBe(false);
  });
});
