import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allocateDraft, commitDraft, createAndCommit, discardDraft, listDrafts } from "./create.js";
import { readStoreIndexFile } from "./store.js";
import { initializeStoreLayout, STORE_SKILLS_DIR, STORE_ARCHIVE_DIR } from "./store-layout.js";
import { hashSkillFolder } from "./hash.js";

const tempDirs: string[] = [];

async function fakeStore(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-create-test-"));
  tempDirs.push(dir);
  await initializeStoreLayout(dir);
  return dir;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  for (const d of tempDirs) await rm(d, { recursive: true, force: true }).catch(() => undefined);
  tempDirs.length = 0;
});

describe("allocateDraft", () => {
  it("creates a draft directory with template SKILL.md", async () => {
    const store = await fakeStore();
    const result = await allocateDraft(store, "my-skill");
    expect(result.kind).toBe("allocated");
    if (result.kind !== "allocated") throw new Error("unexpected");

    expect(result.draft.dirName).toBe("my-skill");
    expect(result.draft.origin.kind).toBe("authored");
    expect(result.storeDir).toContain("my-skill");

    const skillMd = await readFile(path.join(store, STORE_SKILLS_DIR, "my-skill", "SKILL.md"), "utf8");
    expect(skillMd).toContain("name: my-skill");

    const index = await readStoreIndexFile(store);
    expect(index.drafts).toHaveLength(1);
    expect(index.drafts[0]!.dirName).toBe("my-skill");
    expect(index.skills).toHaveLength(0);
  });

  it("conflicts with existing skill in skills[]", async () => {
    const store = await fakeStore();
    const r1 = await allocateDraft(store, "first");
    expect(r1.kind).toBe("allocated");
    await commitDraft(store, "first");

    const r2 = await allocateDraft(store, "first");
    expect(r2.kind).toBe("conflict");
  });

  it("conflicts with existing draft in drafts[]", async () => {
    const store = await fakeStore();
    await allocateDraft(store, "my-skill");
    const r2 = await allocateDraft(store, "my-skill");
    expect(r2.kind).toBe("conflict");
    if (r2.kind === "conflict") {
      expect(r2.reason).toContain("drafts[]");
    }
  });

  it("two drafts from same template do NOT collide (location-first, not content-first)", async () => {
    const store = await fakeStore();
    const r1 = await allocateDraft(store, "alpha");
    const r2 = await allocateDraft(store, "beta");
    expect(r1.kind).toBe("allocated");
    expect(r2.kind).toBe("allocated");

    const index = await readStoreIndexFile(store);
    expect(index.drafts).toHaveLength(2);
  });
});

describe("commitDraft", () => {
  it("moves draft to skills[] with correct hash", async () => {
    const store = await fakeStore();
    await allocateDraft(store, "my-skill", { description: "A test skill" });

    const result = await commitDraft(store, "my-skill");
    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") throw new Error("unexpected");

    expect(result.record.dirName).toBe("my-skill");
    expect(result.record.meta.name).toBe("my-skill");
    expect(result.record.origins[0]!.kind).toBe("authored");

    const expectedHash = await hashSkillFolder(path.join(store, STORE_SKILLS_DIR, "my-skill"));
    expect(result.record.hash).toBe(expectedHash);

    const index = await readStoreIndexFile(store);
    expect(index.drafts).toHaveLength(0);
    expect(index.skills).toHaveLength(1);
  });

  it("returns draft-not-found for unknown dirName", async () => {
    const store = await fakeStore();
    const result = await commitDraft(store, "nonexistent");
    expect(result.kind).toBe("draft-not-found");
  });

  it("committed skill does not drift on verify", async () => {
    const store = await fakeStore();
    await allocateDraft(store, "stable");
    const result = await commitDraft(store, "stable");
    if (result.kind !== "committed") throw new Error("unexpected");

    const actualHash = await hashSkillFolder(path.join(store, STORE_SKILLS_DIR, "stable"));
    expect(result.record.hash).toBe(actualHash);
  });
});

describe("discardDraft", () => {
  it("moves draft to archive/drafts/ and removes from drafts[]", async () => {
    const store = await fakeStore();
    await allocateDraft(store, "throwaway");
    const result = await discardDraft(store, "throwaway");
    expect(result.kind).toBe("discarded");
    if (result.kind !== "discarded") throw new Error("unexpected");
    expect(result.archivePath).toContain("drafts");
    expect(result.archivePath).toContain("throwaway");

    const index = await readStoreIndexFile(store);
    expect(index.drafts).toHaveLength(0);

    const archiveContents = await readdir(path.join(store, STORE_ARCHIVE_DIR, "drafts"));
    expect(archiveContents.length).toBe(1);
    expect(archiveContents[0]).toContain("throwaway");
  });

  it("returns draft-not-found for unknown dirName", async () => {
    const store = await fakeStore();
    const result = await discardDraft(store, "nonexistent");
    expect(result.kind).toBe("draft-not-found");
  });
});

describe("listDrafts", () => {
  it("returns all current drafts", async () => {
    const store = await fakeStore();
    await allocateDraft(store, "a");
    await allocateDraft(store, "b");
    const drafts = await listDrafts(store);
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.dirName).sort()).toEqual(["a", "b"]);
  });
});

describe("createAndCommit", () => {
  it("one-step create for human shell", async () => {
    const store = await fakeStore();
    const result = await createAndCommit(store, "quick", "Quick skill");
    expect(result.kind).toBe("committed");
    if (result.kind !== "committed") throw new Error("unexpected");
    expect(result.record.dirName).toBe("quick");

    const index = await readStoreIndexFile(store);
    expect(index.skills).toHaveLength(1);
    expect(index.drafts).toHaveLength(0);
  });
});
