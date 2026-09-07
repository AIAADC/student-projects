import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSafeRelativePath, writeGitHubEntries } from "./github-files.js";

describe("github-files", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ghfiles-"));
  });
  afterEach(async () => {
    await import("node:fs/promises").then(({ rm }) => rm(dir, { recursive: true, force: true }));
  });

  it("写文件与子目录", async () => {
    await writeGitHubEntries(dir, [
      { path: "SKILL.md", contents: "---\nname: demo\n---" },
      { path: "scripts/build.sh", contents: "#!/bin/sh\necho hi" },
    ]);
    expect(await readFile(path.join(dir, "SKILL.md"), "utf8")).toBe("---\nname: demo\n---");
    expect(await readFile(path.join(dir, "scripts", "build.sh"), "utf8")).toBe("#!/bin/sh\necho hi");
  });

  it("不安全路径整批拒绝,不落盘", async () => {
    for (const bad of ["../evil.md", "/abs.md", "a/../../evil.md", "", "a\\b"]) {
      expect(isSafeRelativePath(bad)).toBe(false);
    }
    await expect(writeGitHubEntries(dir, [{ path: "../evil.md", contents: "x" }])).rejects.toThrow(/不安全/);
    expect(await readdir(dir)).toEqual([]);
  });

  it("安全路径判定", () => {
    expect(isSafeRelativePath("SKILL.md")).toBe(true);
    expect(isSafeRelativePath("a/b/c.txt")).toBe(true);
  });
});
