import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeStoreLayout, STORE_SKILLS_DIR } from "@skills-hub/core";
import { performAllocate, performCommit, performCreate, performDiscard } from "../src/create-cmds.js";

const tempDirs: string[] = [];

async function fakeStore(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-create-cmds-"));
  tempDirs.push(dir);
  await initializeStoreLayout(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("draft perform*(#193)", () => {
  it("allocate 冲突与 commit/discard 缺失的 code 与 CLI/HTTP 同口径", async () => {
    const root = await fakeStore();
    const alloc = await performAllocate(root, "d1");
    expect(alloc.ok).toBe(true);

    const dup = await performAllocate(root, "d1");
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error("expected fail");
    expect(dup.code).toBe("draft-exists");

    const missingC = await performCommit(root, "nope");
    expect(missingC.ok).toBe(false);
    if (missingC.ok) throw new Error("expected fail");
    expect(missingC.code).toBe("draft-not-found");

    const missingD = await performDiscard(root, "nope");
    expect(missingD.ok).toBe(false);
    if (missingD.ok) throw new Error("expected fail");
    expect(missingD.code).toBe("draft-not-found");

    const committed = await performCommit(root, "d1");
    expect(committed.ok).toBe(true);
    if (!committed.ok) throw new Error("expected ok");
    expect(committed.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("commit 不达标 → draft-incomplete;performCreate 一键定稿", async () => {
    const root = await fakeStore();
    const alloc = await performAllocate(root, "incomplete");
    expect(alloc.ok).toBe(true);
    await writeFile(path.join(root, STORE_SKILLS_DIR, "incomplete", "SKILL.md"), "---\nname: incomplete\n---\n", "utf8");
    const incomplete = await performCommit(root, "incomplete");
    expect(incomplete.ok).toBe(false);
    if (incomplete.ok) throw new Error("expected fail");
    expect(incomplete.code).toBe("draft-incomplete");

    const created = await performCreate(root, "oneshot", "a skill from performCreate");
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error("expected ok");
    expect(created.verb).toBe("create");
    expect(created.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
