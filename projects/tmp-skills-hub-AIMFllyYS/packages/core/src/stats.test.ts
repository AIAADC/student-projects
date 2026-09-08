import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readUsageStats, recordUsage, usageRanking } from "./stats.js";
import { STORE_TMP_DIR } from "./store-layout.js";

/**
 * 调用计数(#27):落点、事件区分、并发不丢、损坏/缺失降级。全部沙箱。
 */

const tempDirs: string[] = [];

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-stats-test-"));
  tempDirs.push(dir);
  await import("node:fs/promises").then(({ mkdir }) => mkdir(path.join(dir, STORE_TMP_DIR), { recursive: true }));
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("stats(#27)", () => {
  it("缺失/占位/损坏 → 降级为空统计,不抛错", async () => {
    const dir = await tmp();
    expect((await readUsageStats(dir)).counters).toEqual({});
    await writeFile(path.join(dir, "stats.json"), "{}\n");
    expect((await readUsageStats(dir)).counters).toEqual({});
    await writeFile(path.join(dir, "stats.json"), "garbage");
    expect((await readUsageStats(dir)).counters).toEqual({});
    await writeFile(path.join(dir, "stats.json"), '{"version":99,"counters":{"h":{"show":1,"enable":2}}}');
    expect((await readUsageStats(dir)).counters).toEqual({});
  });

  it("show 与 enable 分别计数,可区分;文件落在库存根目录", async () => {
    const dir = await tmp();
    await recordUsage(dir, "hash-a", "show");
    await recordUsage(dir, "hash-a", "show");
    await recordUsage(dir, "hash-a", "enable");
    await recordUsage(dir, "hash-b", "show");
    const s = await readUsageStats(dir);
    expect(s.version).toBe(1);
    expect(s.counters["hash-a"]).toEqual({ show: 2, enable: 1 });
    expect(s.counters["hash-b"]).toEqual({ show: 1, enable: 0 });
    // 损坏自愈:写坏后 recordUsage 仍成功并产生有效文件
    await writeFile(path.join(dir, "stats.json"), "broken");
    await recordUsage(dir, "hash-c", "show");
    expect((await readUsageStats(dir)).counters["hash-c"]).toEqual({ show: 1, enable: 0 });
  });

  it("并发写入不丢计数(同哈希同时记 20 次)", async () => {
    const dir = await tmp();
    await Promise.all(Array.from({ length: 20 }, () => recordUsage(dir, "hash-x", "enable")));
    const s = await readUsageStats(dir);
    expect(s.counters["hash-x"]!.enable).toBe(20);
  });

  it("排名按总次数降序,确定性", async () => {
    const dir = await tmp();
    await recordUsage(dir, "a", "show");
    await recordUsage(dir, "a", "enable");
    await recordUsage(dir, "b", "show");
    const rank = usageRanking(await readUsageStats(dir));
    expect(rank[0]!.skillHash).toBe("a");
    expect(rank[0]!.total).toBe(2);
    expect(rank[1]!.skillHash).toBe("b");
  });
});
