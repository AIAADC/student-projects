import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  STORE_ARCHIVE_DIR,
  STORE_DATA_FILES,
  STORE_LAYOUT_VERSION,
  STORE_SKILLS_DIR,
  STORE_TMP_DIR,
  initializeStoreLayout,
} from "./store-layout.js";

/**
 * 目录布局初始化(spec §2):建目录、落 manifest、占位数据文件,幂等不破坏。
 * 全部用例使用系统临时目录。
 */

const tempDirs: string[] = [];

async function fakeStoreRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-layout-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("initializeStoreLayout", () => {
  it("首次初始化:建三个子目录 + manifest + 四个数据文件占位", async () => {
    const root = await fakeStoreRoot();
    const result = await initializeStoreLayout(root);

    expect(result.created).toBe(true);
    expect(result.manifest.version).toBe(STORE_LAYOUT_VERSION);
    expect(typeof result.manifest.createdAt).toBe("string");
    expect(new Date(result.manifest.createdAt).getTime()).not.toBeNaN();

    const names = (await readdir(root, { withFileTypes: true })).map((d) => d.name).sort();
    expect(names).toEqual(
      [STORE_ARCHIVE_DIR, STORE_SKILLS_DIR, STORE_TMP_DIR, "manifest.json", ...STORE_DATA_FILES].sort(),
    );

    const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
    expect(manifest.version).toBe(STORE_LAYOUT_VERSION);
    expect(manifest.createdAt).toBe(result.manifest.createdAt);

    for (const file of STORE_DATA_FILES) {
      expect(await readFile(path.join(root, file), "utf8")).toBe("{}\n");
    }
  });

  it("幂等:重复初始化返回 created=false 且不触碰任何已有内容", async () => {
    const root = await fakeStoreRoot();
    const first = await initializeStoreLayout(root);
    const second = await initializeStoreLayout(root);

    expect(second.created).toBe(false);
    expect(second.manifest).toEqual(first.manifest);
    expect(await readFile(path.join(root, "manifest.json"), "utf8")).toBe(
      JSON.stringify(first.manifest, null, 2) + "\n",
    );

    // 初始化后往 skills/ 里放一个自定义文件,再次 init 不得破坏它
    const marker = path.join(root, STORE_SKILLS_DIR, "user-file.txt");
    await writeFile(marker, "user content");
    const third = await initializeStoreLayout(root);
    expect(third.created).toBe(false);
    expect(await readFile(marker, "utf8")).toBe("user content");
  });

  it("已在 storeRoot 放了无关文件,初始化不删除它们", async () => {
    const root = await fakeStoreRoot();
    await mkdir(path.join(root, "unrelated"), { recursive: true });
    await writeFile(path.join(root, "notes.txt"), "keep me");

    await initializeStoreLayout(root);
    expect(await readFile(path.join(root, "notes.txt"), "utf8")).toBe("keep me");
    expect((await readdir(path.join(root, "unrelated"))).length).toBe(0);
  });

  it("manifest 已存在但损坏:抛错,绝不静默覆盖", async () => {
    const root = await fakeStoreRoot();
    await writeFile(path.join(root, "manifest.json"), "{broken");
    await expect(initializeStoreLayout(root)).rejects.toThrow(/无法解析/);
    expect(await readFile(path.join(root, "manifest.json"), "utf8")).toBe("{broken");
  });

  it("manifest 缺字段:抛错,不覆盖", async () => {
    const root = await fakeStoreRoot();
    await writeFile(path.join(root, "manifest.json"), '{"version": 1}');
    await expect(initializeStoreLayout(root)).rejects.toThrow(/version\/createdAt/);
  });
});
