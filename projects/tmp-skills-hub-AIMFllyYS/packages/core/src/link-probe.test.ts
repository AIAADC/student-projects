import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { probeLinkTypes } from "./link-probe.js";

/**
 * 链接能力探测。悬空扫描见 link-status.test.ts(走 classifyClientLink)。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-probe-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("probeLinkTypes", () => {
  it("返回三种链接类型的可用性,且不留下探测残留", async () => {
    const work = await tmp();
    const result = await probeLinkTypes(work);
    expect(typeof result.junction).toBe("boolean");
    expect(typeof result.symlink).toBe("boolean");
    expect(typeof result.hardlink).toBe("boolean");
    // 探测目录与目标目录都被清理
    expect(await readdir(work)).toEqual([]);
  });
});

