import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeStoreLayout, STORE_BACKUPS_DIR } from "@skills-hub/core";
import { runBackup } from "../src/backup-cmds.js";
import { POINTER_REL } from "../src/store-cmds.js";

const temps: string[] = [];

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  process.exitCode = 0;
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function primedHome(): Promise<string> {
  const home = await tmp("skills-hub-bak-cli-");
  await initializeStoreLayout(home);
  await mkdir(path.dirname(path.join(home, POINTER_REL)), { recursive: true });
  await writeFile(path.join(home, POINTER_REL), JSON.stringify({ storeRoot: home }, null, 2) + "\n");
  const skill = path.join(home, ".claude", "skills", "alpha");
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"), "---\nname: alpha\ndescription: a\n---\nbody\n");
  return home;
}

async function captureJson(fn: () => Promise<void>): Promise<{ code: number; out: Record<string, unknown> }> {
  process.exitCode = 0;
  const logs: string[] = [];
  const orig = console.log;
  const origErr = console.error;
  console.log = (m?: unknown) => { logs.push(String(m ?? "")); };
  console.error = () => undefined;
  try {
    await fn();
  } finally {
    console.log = orig;
    console.error = origErr;
  }
  const line = logs.find((l) => l.startsWith("{"));
  if (line === undefined) throw new Error("no json: " + logs.join("\n"));
  return { code: process.exitCode ?? 0, out: JSON.parse(line) as Record<string, unknown> };
}

function args(home: string, extra: Partial<{ yes: boolean; dryRun: boolean; full: boolean; _: string[] }> = {}) {
  return {
    home,
    yes: extra.yes,
    dryRun: extra.dryRun,
    json: true as const,
    full: extra.full,
    _: extra._ ?? [],
  };
}

describe("runBackup", () => {
  it("dry-run 不写盘", async () => {
    const home = await primedHome();
    const r = await captureJson(() => runBackup(args(home, { dryRun: true })));
    expect(r.code).toBe(0);
    expect(r.out.ok).toBe(true);
    expect(r.out.dryRun).toBe(true);
    expect(r.out.verb).toBe("create");
    expect(r.out.mode).toBe("incremental");
    await expect(readdir(path.join(home, STORE_BACKUPS_DIR))).rejects.toThrow();
  });

  it("无 --yes 拒绝写", async () => {
    const home = await primedHome();
    const r = await captureJson(() => runBackup(args(home)));
    expect(r.code).toBe(2);
    expect(r.out.ok).toBe(false);
    expect(r.out.code).toBe("auth-required");
    await expect(readdir(path.join(home, STORE_BACKUPS_DIR))).rejects.toThrow();
  });

  it("全量 / 增量 / 幂等:第二次不新增 blob,--full 仍建新快照", async () => {
    const home = await primedHome();
    const first = await captureJson(() => runBackup(args(home, { yes: true, full: true })));
    expect(first.out.ok).toBe(true);
    expect(first.out.mode).toBe("full");
    expect(first.out.blobsWritten).toBe(1);
    const blobs1 = await readdir(path.join(home, STORE_BACKUPS_DIR, "blobs"));
    expect(blobs1).toHaveLength(1);

    const second = await captureJson(() => runBackup(args(home, { yes: true })));
    expect(second.out.ok).toBe(true);
    expect(second.out.mode).toBe("incremental");
    expect(second.out.blobsWritten).toBe(0);
    expect(second.out.snapshotId).not.toBe(first.out.snapshotId);
    expect(await readdir(path.join(home, STORE_BACKUPS_DIR, "blobs"))).toHaveLength(1);

    const third = await captureJson(() => runBackup(args(home, { yes: true, full: true })));
    expect(third.out.ok).toBe(true);
    expect(third.out.mode).toBe("full");
    expect(third.out.blobsWritten).toBe(0);
    expect(third.out.snapshotId).not.toBe(second.out.snapshotId);
    expect(await readdir(path.join(home, STORE_BACKUPS_DIR, "blobs"))).toHaveLength(1);

    const listed = await captureJson(() => runBackup(args(home, { _: ["list"] })));
    expect(listed.out.ok).toBe(true);
    expect(listed.out.verb).toBe("list");
    expect((listed.out.snapshots as unknown[]).length).toBe(3);
    expect(listed.out.latest).toBe(third.out.snapshotId);
  });

  it("verify 完好通过;改坏 blob 后失败并指出路径", async () => {
    const home = await primedHome();
    await captureJson(() => runBackup(args(home, { yes: true })));
    const ok = await captureJson(() => runBackup(args(home, { _: ["verify"] })));
    expect(ok.code).toBe(0);
    expect(ok.out.ok).toBe(true);
    expect(ok.out.passed).toBe(true);
    expect(ok.out.issues).toEqual([]);

    const blobs = await readdir(path.join(home, STORE_BACKUPS_DIR, "blobs"));
    await writeFile(path.join(home, STORE_BACKUPS_DIR, "blobs", blobs[0]!), "corrupted-bytes");
    const bad = await captureJson(() => runBackup(args(home, { _: ["verify"] })));
    expect(bad.code).toBe(2);
    expect(bad.out.ok).toBe(false);
    expect(bad.out.code).toBe("verify-failed");
    const issues = bad.out.issues as Array<{ rel: string; reason: string }>;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.rel).toContain("SKILL.md");
    expect(issues[0]!.reason).toBe("mismatch");
  });

  it("restore dry-run 不写盘;restore --yes 写回客户端", async () => {
    const home = await primedHome();
    await captureJson(() => runBackup(args(home, { yes: true })));
    const skill = path.join(home, ".claude", "skills", "alpha", "SKILL.md");
    await writeFile(skill, "---\nname: alpha\ndescription: a\n---\nmutated\n");
    const dry = await captureJson(() => runBackup(args(home, { dryRun: true, _: ["restore"] })));
    expect(dry.code).toBe(0);
    expect(dry.out.verb).toBe("restore");
    expect(dry.out.dryRun).toBe(true);
    expect(await readFile(skill, "utf8")).toContain("mutated");
    const done = await captureJson(() => runBackup(args(home, { yes: true, _: ["restore"] })));
    expect(done.code).toBe(0);
    expect(done.out.verb).toBe("restore");
    expect(await readFile(skill, "utf8")).toContain("name: alpha");
    expect(await readFile(skill, "utf8")).not.toContain("mutated");
  });

  it("verify 无快照报 not-found", async () => {
    const home = await primedHome();
    const r = await captureJson(() => runBackup(args(home, { _: ["verify"] })));
    expect(r.code).toBe(2);
    expect(r.out.code).toBe("not-found");
  });
});
