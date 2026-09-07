import { mkdir, rename } from "node:fs/promises";
import path from "node:path";
import {
  previewRestoreClientSkills,
  readPointerStoreRoot,
  restoreClientSkills,
  STORE_ARCHIVE_DIR,
  STORE_BACKUPS_DIR,
  STORE_DATA_FILES,
  STORE_SKILLS_DIR,
  STORE_TMP_DIR,
} from "@skills-hub/core";
import { migrateAllSkills } from "./bootstrap.js";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { openBrowser } from "./open-console.js";
import { POINTER_REL, requireWriteAuth } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer, type StartUiServerOptions } from "./ui-server.js";

export interface ResetArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  snapshot: string | undefined;
  port?: number;
}

export interface ResetOptions {
  ui?: boolean | ((opts: StartUiServerOptions) => Promise<void>);
}

export type ResetFailureCode =
  | "store-not-configured"
  | "not-found"
  | "verify-failed"
  | "restore-failed"
  | "io-error";

export type ResetFailure = {
  ok: false;
  code: ResetFailureCode;
  message: string;
};

export type ResetSuccess = {
  ok: true;
  storeRoot: string;
  snapshotId: string;
  asideStore: string;
  asidePointer: string;
  adopted: number;
};

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isInside(inner: string, outer: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

const STORE_ASIDE_NAMES = [
  STORE_SKILLS_DIR,
  STORE_ARCHIVE_DIR,
  STORE_TMP_DIR,
  STORE_BACKUPS_DIR,
  "manifest.json",
  ...STORE_DATA_FILES,
  ".skills-hub",
];

/** 库存与 home 重合时只旁路库存布局,不整目录改名(里面还有客户端 skills)。 */
async function asideInventory(
  storeRoot: string,
  home: string,
  asideStore: string,
  asidePointer: string,
): Promise<string> {
  const pointerDir = path.dirname(path.join(home, POINTER_REL));
  if (path.resolve(storeRoot) === path.resolve(home)) {
    await mkdir(asideStore, { recursive: true });
    for (const name of STORE_ASIDE_NAMES) {
      try {
        await rename(path.join(storeRoot, name), path.join(asideStore, name));
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") throw e;
      }
    }
    return asideStore;
  }
  await rename(storeRoot, asideStore);
  if (!isInside(pointerDir, storeRoot)) {
    await rename(pointerDir, asidePointer).catch(() => undefined);
    return asidePointer;
  }
  return asideStore;
}

function planAside(storeRoot: string, home: string): { asideStore: string; asidePointer: string } {
  const pointerDir = path.dirname(path.join(home, POINTER_REL));
  const mark = stamp();
  const asideStore = storeRoot + ".pre-reinit-" + mark;
  const pointerMovesWithStore =
    path.resolve(storeRoot) === path.resolve(home) || isInside(pointerDir, storeRoot);
  const asidePointer = pointerMovesWithStore ? asideStore : pointerDir + ".pre-reinit-" + mark;
  return { asideStore, asidePointer };
}

/**
 * 还原客户端 → 旁路指针与旧库存 → 用确认前 storeRoot 再收录。
 * CLI 与 POST /api/reset 共用;不拉起面板、不 process.exit。
 */
export async function performReset(input: {
  home: string;
  snapshotId?: string;
}): Promise<ResetSuccess | ResetFailure> {
  const home = resolveHome(input.home);
  const pointerFile = path.join(home, POINTER_REL);
  const storeRoot = await readPointerStoreRoot(pointerFile);
  if (storeRoot === null) {
    return { ok: false, code: "store-not-configured", message: "库存未配置。先运行 skills-hub bootstrap 或 init。" };
  }
  const snapshotId = input.snapshotId === undefined || input.snapshotId === "" ? undefined : input.snapshotId;
  const restored = snapshotId === undefined
    ? await restoreClientSkills(storeRoot, home)
    : await restoreClientSkills(storeRoot, home, snapshotId);
  if (!restored.ok) {
    return { ok: false, code: restored.code, message: restored.message };
  }
  const { asideStore, asidePointer } = planAside(storeRoot, home);
  try {
    await asideInventory(storeRoot, home, asideStore, asidePointer);
    const migrated = await migrateAllSkills(home, storeRoot);
    return {
      ok: true,
      storeRoot,
      snapshotId: restored.snapshotId,
      asideStore,
      asidePointer,
      adopted: migrated.adopted,
    };
  } catch (e) {
    return { ok: false, code: "io-error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** reset:还原客户端 → 旁路指针与旧库存 → 用确认前 storeRoot 再收录。 */
export async function runReset(args: ResetArgs, opts: ResetOptions = {}): Promise<void> {
  const home = resolveHome(args.home);
  const pointerFile = path.join(home, POINTER_REL);
  const storeRoot = await readPointerStoreRoot(pointerFile);
  if (storeRoot === null) {
    emitError(args.json === true, "reset", "store-not-configured", "库存未配置。先运行 skills-hub bootstrap 或 init。");
    return;
  }
  const snapshotId = args.snapshot === undefined || args.snapshot === "" ? undefined : args.snapshot;
  const preview = snapshotId === undefined
    ? await previewRestoreClientSkills(storeRoot, home)
    : await previewRestoreClientSkills(storeRoot, home, snapshotId);
  if (!preview.ok) {
    emitError(args.json === true, "reset", preview.code, preview.message);
    return;
  }
  const { asideStore, asidePointer } = planAside(storeRoot, home);

  if (args.dryRun === true) {
    if (args.json === true) {
      emitOk("reset", {
        dryRun: true,
        storeRoot,
        snapshotId: preview.snapshotId,
        clients: preview.clients,
        skills: preview.skills,
        files: preview.files,
        links: preview.links,
        wouldRestore: preview.wouldRestore,
        asideStore,
        asidePointer,
      });
      return;
    }
    console.log("预演:reset 快照 " + preview.snapshotId + ",将旁路 " + asideStore + ",不写盘。");
    return;
  }

  if (!requireWriteAuth(args, "reset")) return;

  const result = await performReset(snapshotId === undefined ? { home } : { home, snapshotId });
  if (!result.ok) {
    emitError(args.json === true, "reset", result.code, result.message);
    return;
  }
  if (args.json === true) {
    emitOk("reset", {
      storeRoot: result.storeRoot,
      snapshotId: result.snapshotId,
      asideStore: result.asideStore,
      asidePointer: result.asidePointer,
      adopted: result.adopted,
    });
  } else {
    console.log("✓ reset 完成:库存 " + result.storeRoot + ",收录 " + result.adopted + " 份。旧库存: " + result.asideStore);
  }

  if (opts.ui === false) return;
  const port = args.port ?? DEFAULT_UI_PORT;
  const start = typeof opts.ui === "function" ? opts.ui : startUiServer;
  await start({ port, home });
  if (typeof opts.ui !== "function") openBrowser("http://127.0.0.1:" + port);
}
