import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeStoreLayout } from "@skills-hub/core";
import { POINTER_REL } from "../src/store-cmds.js";
import { runBackup } from "../src/backup-cmds.js";
import { runReset } from "../src/reset-cmds.js";

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
  const home = await tmp("skills-hub-reset-");
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

describe("runReset", () => {
  it("dry-run 不写盘;--yes 旁路旧库并用原路径再收录", async () => {
    const home = await primedHome();
    await captureJson(() => runBackup({
      home, yes: true, dryRun: false, json: true, full: false, _: [],
    }));
    const skill = path.join(home, ".claude", "skills", "alpha", "SKILL.md");
    await writeFile(skill, "---\nname: alpha\ndescription: a\n---\nmutated\n");

    const dry = await captureJson(() => runReset({
      home, yes: true, dryRun: true, json: true, snapshot: undefined,
    }, { ui: false }));
    expect(dry.code).toBe(0);
    expect(dry.out.dryRun).toBe(true);
    expect(dry.out.command).toBe("reset");
    expect(await readFile(skill, "utf8")).toContain("mutated");
    const pointerBefore = JSON.parse(await readFile(path.join(home, POINTER_REL), "utf8")) as { storeRoot: string };
    expect(pointerBefore.storeRoot).toBe(home);

    const done = await captureJson(() => runReset({
      home, yes: true, dryRun: false, json: true, snapshot: undefined,
    }, { ui: false }));
    expect(done.code).toBe(0);
    expect(done.out.ok).toBe(true);
    expect(done.out.storeRoot).toBe(home);
    expect(String(done.out.asideStore)).toContain(".pre-reinit-");
    const pointer = JSON.parse(await readFile(path.join(home, POINTER_REL), "utf8")) as { storeRoot: string };
    expect(pointer.storeRoot).toBe(home);
    expect(await readFile(skill, "utf8")).toContain("name: alpha");
    expect(await readFile(skill, "utf8")).not.toContain("mutated");
    const parent = path.dirname(home);
    const asides = (await readdir(parent)).filter((n) => n.startsWith(path.basename(home) + ".pre-reinit-"));
    expect(asides.length).toBeGreaterThan(0);
    const adopted = await readdir(path.join(home, "skills"));
    expect(adopted).toContain("alpha");
  });

  it("无 --yes 拒绝", async () => {
    const home = await primedHome();
    await captureJson(() => runBackup({
      home, yes: true, dryRun: false, json: true, full: false, _: [],
    }));
    const r = await captureJson(() => runReset({
      home, yes: false, dryRun: false, json: true, snapshot: undefined,
    }, { ui: false }));
    expect(r.code).toBe(2);
    expect(r.out.code).toBe("auth-required");
  });
});
