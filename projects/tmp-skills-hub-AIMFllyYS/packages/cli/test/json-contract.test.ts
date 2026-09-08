import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * JSON 输出契约 v0(#28):逐条断言 docs/specs/json-contract-v0.md §2 的形状。
 * 契约改动必须同步改这里,否则 CI 失败。spawn 的是构建产物(dist),所以测试前先 tsc -b。
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(here, "..", "dist", "index.js");

let home: string;
const tempRoots: string[] = [];

function runCli(args: string[], opts: { env?: Record<string, string> } = {}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      code: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

async function setupStore(): Promise<void> {
  home = await mkdtemp(path.join(os.tmpdir(), "skills-hub-contract-"));
  tempRoots.push(home);
  await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
  const r = runCli(["init", "--home", home, "--yes", "--json"]);
  expect(r.code).toBe(0);
  const sample = path.join(home, "..", "contract-sample-" + path.basename(home));
  await mkdir(sample, { recursive: true });
  await writeFile(path.join(sample, "SKILL.md"), "---\nname: demo\ndescription: contract demo\n---\npayload\n");
  const a = runCli(["adopt", sample, "--home", home, "--yes", "--json"]);
  expect(a.code).toBe(0);
}

beforeAll(async () => {
  await setupStore();
});

afterAll(async () => {
  await Promise.all(tempRoots.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  await Promise.all(tempRoots.splice(0).map((d) => rm(d.replace("contract-", "contract-sample-"), { recursive: true, force: true })));
});

describe("json 契约 v0(#28)", () => {
  it("list --json:信封 + origins/visibleIn 分离,无 source 字段", () => {
    const r = runCli(["list", "--home", home, "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout) as { ok: boolean; command: string; storeRoot: string; total: number; skills: Array<Record<string, unknown>> };
    expect(out.ok).toBe(true);
    expect(out.command).toBe("list");
    expect(out.total).toBe(1);
    expect(out.skills).toHaveLength(1);
    const s = out.skills[0]!;
    expect(s.hash).toEqual(expect.any(String));
    expect(s.dirName).toBe("demo");
    expect(s.origins).toEqual([{ kind: "local-scan", reference: expect.any(String) }]);
    expect(s.visibleIn).toEqual([]);
    expect(s).not.toHaveProperty("source");
  });

  it("show --json:命中与未命中(not-found 信封 + exit 2)", () => {
    const hit = runCli(["show", "demo", "--home", home, "--json"]);
    expect(hit.code).toBe(0);
    const out = JSON.parse(hit.stdout) as { ok: boolean; command: string; matches: Array<{ dirName: string }> };
    expect(out.ok).toBe(true);
    expect(out.command).toBe("show");
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]!.dirName).toBe("demo");
    const miss = runCli(["show", "nope", "--home", home, "--json"]);
    expect(miss.code).toBe(2);
    const err = JSON.parse(miss.stdout) as { ok: boolean; command: string; code: string; message: string };
    expect(err.ok).toBe(false);
    expect(err.command).toBe("show");
    expect(err.code).toBe("not-found");
    expect(err.message).toEqual(expect.any(String));
  });

  it("doctor --json:自检结果即成功(store.resolved/reachable 表达状态)", () => {
    const r = runCli(["doctor", "--home", home, "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout) as {
      ok: boolean;
      command: string;
      store: { resolved: boolean; storeRoot: string | null; reachable: boolean; error: string | null };
      roots: Array<{ clientId: string; skillsDir: string }>;
      linkTypes: { junction: boolean; symlink: boolean; hardlink: boolean };
      danglingLinks: unknown[];
    };
    expect(out.ok).toBe(true);
    expect(out.command).toBe("doctor");
    expect(out.store.resolved).toBe(true);
    expect(out.store.reachable).toBe(true);
    expect(out.store.storeRoot).toBe(home);
    expect(Array.isArray(out.roots)).toBe(true);
    expect(typeof out.linkTypes.junction).toBe("boolean");
  });

  it("group --json:list 信封 + create 重复报 group-exists", () => {
    const list = runCli(["group", "list", "--home", home, "--json"]);
    expect(list.code).toBe(0);
    const lo = JSON.parse(list.stdout) as { ok: boolean; command: string; verb: string; groups: Array<{ id: string; name: string; description: string; memberHashes: string[] }> };
    expect(lo.ok).toBe(true);
    expect(lo.command).toBe("group");
    expect(lo.verb).toBe("list");
    expect(lo.groups.length).toBeGreaterThanOrEqual(5);
    const create = runCli(["group", "create", "mygroup", "--home", home, "--yes", "--json"]);
    expect(create.code).toBe(0);
    const co = JSON.parse(create.stdout) as { ok: boolean; command: string; verb: string; id: string };
    expect(co.ok).toBe(true);
    expect(co.verb).toBe("create");
    expect(co.id).toBe("mygroup");
    const dup = runCli(["group", "create", "mygroup", "--home", home, "--yes", "--json"]);
    expect(dup.code).toBe(2);
    const do2 = JSON.parse(dup.stdout) as { ok: boolean; code: string };
    expect(do2.ok).toBe(false);
    expect(do2.code).toBe("group-exists");
  });

  it("enable --json:缺 --yes 报 auth-required;成功含 clientId(与来源分离)", async () => {
    const noYes = runCli(["enable", "demo", "--client", "claude", "--home", home, "--json"]);
    expect(noYes.code).toBe(2);
    const ne = JSON.parse(noYes.stdout) as { ok: boolean; code: string };
    expect(ne.ok).toBe(false);
    expect(ne.code).toBe("auth-required");
    const r = runCli(["enable", "demo", "--client", "claude", "--home", home, "--yes", "--json"]);
    expect(r.code).toBe(0);
    const out = JSON.parse(r.stdout) as { ok: boolean; command: string; clientId: string; created: string[]; removed: string[] };
    expect(out.ok).toBe(true);
    expect(out.command).toBe("enable");
    expect(out.clientId).toBe("claude");
    expect(out.created).toHaveLength(1);
    // 链接后 list --json:visibleIn 由台账推导;index.json 不缓存
    const list = runCli(["list", "--home", home, "--json"]);
    const lo = JSON.parse(list.stdout) as { skills: Array<{ visibleIn: string[]; origins: unknown[] }> };
    expect(lo.skills[0]!.visibleIn).toContain("claude");
    expect(lo.skills[0]!.origins).toHaveLength(1);
    const index = JSON.parse(await readFile(path.join(home, "index.json"), "utf8")) as { skills: Array<{ visibleIn: string[] }> };
    expect(index.skills[0]!.visibleIn).toEqual([]);
  });

  it("backup --json:dry-run 不写盘;create/list/verify 信封", () => {
    const dry = runCli(["backup", "--home", home, "--dry-run", "--json"]);
    expect(dry.code).toBe(0);
    const d = JSON.parse(dry.stdout) as { ok: boolean; command: string; verb: string; dryRun: boolean; mode: string };
    expect(d.ok).toBe(true);
    expect(d.command).toBe("backup");
    expect(d.verb).toBe("create");
    expect(d.dryRun).toBe(true);
    expect(d.mode).toBe("incremental");
    expect(d).not.toHaveProperty("snapshotId");

    const created = runCli(["backup", "--home", home, "--yes", "--json"]);
    expect(created.code).toBe(0);
    const c = JSON.parse(created.stdout) as { ok: boolean; verb: string; snapshotId: string; files: number };
    expect(c.ok).toBe(true);
    expect(c.verb).toBe("create");
    expect(c.snapshotId).toEqual(expect.any(String));

    const listed = runCli(["backup", "list", "--home", home, "--json"]);
    expect(listed.code).toBe(0);
    const l = JSON.parse(listed.stdout) as { verb: string; snapshots: unknown[]; latest: string };
    expect(l.verb).toBe("list");
    expect(l.snapshots.length).toBeGreaterThanOrEqual(1);
    expect(l.latest).toBe(c.snapshotId);

    const verified = runCli(["backup", "verify", "--home", home, "--json"]);
    expect(verified.code).toBe(0);
    const v = JSON.parse(verified.stdout) as { verb: string; passed: boolean; issues: unknown[] };
    expect(v.verb).toBe("verify");
    expect(v.passed).toBe(true);
    expect(v.issues).toEqual([]);

    const restored = runCli(["backup", "restore", "--home", home, "--dry-run", "--json"]);
    expect(restored.code).toBe(0);
    const rr = JSON.parse(restored.stdout) as { command: string; verb: string; dryRun: boolean; snapshotId: string };
    expect(rr.command).toBe("backup");
    expect(rr.verb).toBe("restore");
    expect(rr.dryRun).toBe(true);
    expect(rr.snapshotId).toEqual(expect.any(String));

    const resetDry = runCli(["reset", "--home", home, "--dry-run", "--json"]);
    expect(resetDry.code).toBe(0);
    const rd = JSON.parse(resetDry.stdout) as { command: string; dryRun: boolean; storeRoot: string; snapshotId: string };
    expect(rd.command).toBe("reset");
    expect(rd.dryRun).toBe(true);
    expect(rd.storeRoot).toBe(home);
    expect(rd.snapshotId).toEqual(expect.any(String));
  });

  it("share --json:无 token 报 auth-required", () => {
    const r = runCli(["share", "demo", "--home", home, "--yes", "--json", "--repo", "club/skills"], { env: { GITHUB_TOKEN: "" } });
    expect(r.code).toBe(2);
    const out = JSON.parse(r.stdout) as { ok: boolean; command: string; code: string };
    expect(out.ok).toBe(false);
    expect(out.command).toBe("share");
    expect(out.code).toBe("auth-required");
  });

  it("未配置库存:store-not-configured 信封 + exit 2(--home 是显式库存根,此例用非法 env 路径触发)", () => {
    const r = runCli(["list", "--json"], { env: { SKILLS_HUB_HOME: "relative-path" } });
    expect(r.code).toBe(2);
    const out = JSON.parse(r.stdout) as { ok: boolean; command: string; code: string };
    expect(out.ok).toBe(false);
    expect(out.command).toBe("list");
    expect(out.code).toBe("store-not-configured");
  });
});
