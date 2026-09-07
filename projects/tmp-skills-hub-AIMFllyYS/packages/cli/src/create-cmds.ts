import {
  allocateDraft,
  commitDraft,
  createAndCommit,
  discardDraft,
  listDrafts,
  STORE_SKILLS_DIR,
  type AllocateOutcome,
  type CommitOutcome,
  type SkillSource,
} from "@skills-hub/core";
import path from "node:path";
import { resolveStoreRootOrFail } from "./store-cmds.js";
import { emitError, emitOk } from "./json-out.js";

/**
 * CLI `new` command implementation (#169)。
 * 写路径与 HTTP /api/drafts* 共用 performAllocate / performCommit / performDiscard / performCreate。
 *
 * Authorization tiering (cli-commands-v0.md §2.1):
 *   - new / new commit / new discard: store-internal writes, no --yes required
 *   - new commit --enable: links into client dir, requires --yes (not implemented here)
 */

export interface CreateArgs {
  home: string | undefined;
  json: boolean | undefined;
  description: string | undefined;
  _: (string | number)[];
}

export type DraftFailCode = "bad-usage" | "draft-exists" | "draft-not-found" | "draft-incomplete" | "io-error";

export type DraftFail = { ok: false; code: DraftFailCode; message: string };

export type DraftAllocateOk = { ok: true; verb: "allocate"; dirName: string; storeDir: string };
export type DraftCommitOk = { ok: true; verb: "commit"; dirName: string; hash: string };
export type DraftCreateOk = { ok: true; verb: "create"; dirName: string; hash: string; storeDir: string };
export type DraftDiscardOk = { ok: true; verb: "discard"; dirName: string; archivePath: string };

function failFromCommit(result: Exclude<CommitOutcome, { kind: "committed" }>, dirName: string): DraftFail {
  switch (result.kind) {
    case "draft-not-found":
      return { ok: false, code: "draft-not-found", message: "草稿不存在: " + dirName };
    case "incomplete":
      return { ok: false, code: "draft-incomplete", message: result.reason };
    case "duplicate":
      return { ok: false, code: "draft-exists", message: "内容与已有记录重复: " + result.record.dirName };
    case "conflict":
      return { ok: false, code: "draft-exists", message: result.reason };
  }
}

function failFromAllocate(result: Extract<AllocateOutcome, { kind: "conflict" }>): DraftFail {
  return { ok: false, code: "draft-exists", message: result.reason };
}

export async function performAllocate(
  storeRoot: string,
  dirName: string,
  opts: { description?: string; origin?: SkillSource } = {},
): Promise<DraftAllocateOk | DraftFail> {
  const name = dirName.trim();
  if (name === "") return { ok: false, code: "bad-usage", message: "需要 dirName" };
  const seed: { description?: string; origin?: SkillSource } = {
    origin: opts.origin ?? { kind: "authored", reference: "cli" },
  };
  if (opts.description !== undefined && opts.description !== "") seed.description = opts.description;
  const result = await allocateDraft(storeRoot, name, seed);
  if (result.kind === "conflict") return failFromAllocate(result);
  return { ok: true, verb: "allocate", dirName: result.draft.dirName, storeDir: result.storeDir };
}

export async function performCommit(storeRoot: string, dirName: string): Promise<DraftCommitOk | DraftFail> {
  const name = dirName.trim();
  if (name === "") return { ok: false, code: "bad-usage", message: "需要 dirName" };
  const result = await commitDraft(storeRoot, name);
  if (result.kind !== "committed") return failFromCommit(result, name);
  return { ok: true, verb: "commit", dirName: name, hash: result.record.hash };
}

/** 一键创建:allocate + commit。HTTP POST /api/drafts 在 description 非空时走这里。 */
export async function performCreate(
  storeRoot: string,
  dirName: string,
  description: string,
  origin?: SkillSource,
): Promise<DraftCreateOk | DraftFail> {
  const name = dirName.trim();
  if (name === "") return { ok: false, code: "bad-usage", message: "需要 dirName" };
  const desc = description.trim();
  if (desc === "") return { ok: false, code: "bad-usage", message: "一键创建需要 description" };
  const result = await createAndCommit(storeRoot, name, desc, origin ?? { kind: "authored", reference: "cli" });
  if (result.kind === "conflict") return failFromAllocate(result);
  if (result.kind === "allocated") return { ok: false, code: "io-error", message: "未知结果" };
  if (result.kind !== "committed") return failFromCommit(result, name);
  return { ok: true, verb: "create", dirName: name, hash: result.record.hash, storeDir: path.join(storeRoot, STORE_SKILLS_DIR, name) };
}

export async function performDiscard(storeRoot: string, dirName: string): Promise<DraftDiscardOk | DraftFail> {
  const name = dirName.trim();
  if (name === "") return { ok: false, code: "bad-usage", message: "需要 dirName" };
  const result = await discardDraft(storeRoot, name);
  if (result.kind === "draft-not-found") {
    return { ok: false, code: "draft-not-found", message: "草稿不存在: " + name };
  }
  return { ok: true, verb: "discard", dirName: name, archivePath: result.archivePath };
}

export async function runNew(args: CreateArgs): Promise<void> {
  const positionals = args._.map(String);
  const verb = positionals[0] ?? "";

  if (verb === "commit") return runCommit(args, positionals.slice(1));
  if (verb === "discard") return runDiscard(args, positionals.slice(1));
  if (verb === "list") return runList(args);

  const dirName = verb || positionals[1];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new <name> — 需要指定 skill 名");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const allocOpts: { description?: string; origin: SkillSource } = { origin: { kind: "authored", reference: "cli" } };
  if (args.description) allocOpts.description = args.description;
  const result = await performAllocate(storeRoot, dirName, allocOpts);

  if (!result.ok) {
    emitError(args.json === true, "new", result.code, result.message);
    return;
  }

  if (args.json) {
    emitOk("new", { verb: "allocate", dirName: result.dirName, storeDir: result.storeDir });
  } else {
    console.log("草稿已创建: " + result.dirName);
    console.log("  路径: " + result.storeDir);
    console.log("  请编辑 SKILL.md,然后运行 skills-hub new commit " + dirName);
  }
}

async function runCommit(args: CreateArgs, positionals: string[]): Promise<void> {
  const dirName = positionals[0];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new commit <name>");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const result = await performCommit(storeRoot, dirName);
  if (!result.ok) {
    emitError(args.json === true, "new", result.code, result.message);
    return;
  }
  if (args.json) {
    emitOk("new", { verb: "commit", dirName: result.dirName, hash: result.hash });
  } else {
    console.log("定稿成功: " + result.dirName + " (哈希 " + result.hash.slice(0, 12) + ")");
  }
}

async function runDiscard(args: CreateArgs, positionals: string[]): Promise<void> {
  const dirName = positionals[0];
  if (!dirName) {
    emitError(args.json === true, "new", "bad-usage", "用法: new discard <name>");
    return;
  }

  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const result = await performDiscard(storeRoot, dirName);
  if (!result.ok) {
    emitError(args.json === true, "new", result.code, result.message);
    return;
  }

  if (args.json) {
    emitOk("new", { verb: "discard", dirName: result.dirName, archivePath: result.archivePath });
  } else {
    console.log("草稿已归档: " + result.dirName);
    console.log("  归档位置: " + result.archivePath);
  }
}

async function runList(args: CreateArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "new");
  if (storeRoot === null) return;

  const drafts = await listDrafts(storeRoot);

  if (args.json) {
    emitOk("new", { verb: "list", drafts });
    return;
  }

  if (drafts.length === 0) {
    console.log("无草稿。");
    return;
  }

  for (const d of drafts) {
    console.log(`  ${d.dirName} — ${d.meta.description} (${d.createdAt})`);
  }
  console.log(`\n共 ${drafts.length} 个草稿。`);
}
