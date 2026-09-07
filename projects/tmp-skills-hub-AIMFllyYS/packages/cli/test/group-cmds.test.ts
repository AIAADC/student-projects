import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureBuiltinGroups, initializeStoreLayout } from "@skills-hub/core";
import {
  performCreateGroup,
  performDeleteGroup,
  performGroupMembers,
  performUpdateGroup,
} from "../src/group-cmds.js";

const tempDirs: string[] = [];

async function fakeStore(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-group-cmds-"));
  tempDirs.push(dir);
  await initializeStoreLayout(dir);
  await ensureBuiltinGroups(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("group perform*(#193)", () => {
  it("create:非法 id / 重复 与 HTTP 同 code", async () => {
    const root = await fakeStore();
    const bad = await performCreateGroup(root, { id: "Bad_ID" });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error("expected fail");
    expect(bad.code).toBe("bad-usage");

    const ok = await performCreateGroup(root, { id: "tmp-g", name: "临时", description: "d" });
    expect(ok.ok).toBe(true);
    if (!ok.ok) throw new Error("expected ok");
    expect(ok.name).toBe("临时");

    const dup = await performCreateGroup(root, { id: "tmp-g" });
    expect(dup.ok).toBe(false);
    if (dup.ok) throw new Error("expected fail");
    expect(dup.code).toBe("group-exists");
  });

  it("update/delete:缺失 group-not-found;PATCH 可改 description 不直写 groups 对象", async () => {
    const root = await fakeStore();
    await performCreateGroup(root, { id: "tmp-g", name: "n", description: "old" });
    const missing = await performUpdateGroup(root, { id: "nope", name: "x" });
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error("expected fail");
    expect(missing.code).toBe("group-not-found");

    const renamed = await performUpdateGroup(root, { id: "tmp-g", description: "new-desc" });
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) throw new Error("expected ok");
    expect(renamed.name).toBe("n");
    expect(renamed.description).toBe("new-desc");

    const delMissing = await performDeleteGroup(root, "nope");
    expect(delMissing.ok).toBe(false);
    if (delMissing.ok) throw new Error("expected fail");
    expect(delMissing.code).toBe("group-not-found");

    const del = await performDeleteGroup(root, "tmp-g");
    expect(del.ok).toBe(true);
    if (!del.ok) throw new Error("expected ok");
    expect(del.memberCount).toBe(0);
  });

  it("members:组不存在 group-not-found;skill 不存在 not-found", async () => {
    const root = await fakeStore();
    const noGroup = await performGroupMembers(root, { id: "nope", needles: ["demo"], action: "add" });
    expect(noGroup.ok).toBe(false);
    if (noGroup.ok) throw new Error("expected fail");
    expect(noGroup.code).toBe("group-not-found");

    const noSkill = await performGroupMembers(root, { id: "development", needles: ["no-such-skill"], action: "add" });
    expect(noSkill.ok).toBe(false);
    if (noSkill.ok) throw new Error("expected fail");
    expect(noSkill.code).toBe("not-found");
  });
});
