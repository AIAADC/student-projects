import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  discoverClientRoots,
  findDanglingLinks,
  probeLinkTypes,
  readLinksLedger,
  readStoreIndex,
  resolveStoreRoot,
  type DanglingLink,
  type LinkEntry,
  type LinkTypeProbe,
  type StoreRootOptions,
} from "@skills-hub/core";
import { POINTER_REL } from "./store-cmds.js";

export interface DoctorStoreInfo {
  resolved: boolean;
  storeRoot: string | null;
  reachable: boolean;
  error: string | null;
}

export interface DoctorReport {
  store: DoctorStoreInfo;
  roots: { clientId: string; skillsDir: string }[];
  linkTypes: LinkTypeProbe;
  danglingLinks: DanglingLink[];
}

async function probeStore(storeRoot: string): Promise<{ reachable: boolean; error: string | null }> {
  try {
    await readStoreIndex(storeRoot);
    return { reachable: true, error: null };
  } catch (e) {
    return { reachable: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 环境自检。只读:不改库存、不修链接。 */
export async function collectDoctorReport(
  home: string,
  injectedStoreRoot?: string | null,
  storeOpts?: StoreRootOptions,
): Promise<DoctorReport> {
  let store: DoctorStoreInfo;
  if (injectedStoreRoot !== undefined) {
    if (injectedStoreRoot === null) {
      store = { resolved: false, storeRoot: null, reachable: false, error: "库存未配置" };
    } else {
      const probe = await probeStore(injectedStoreRoot);
      store = { resolved: true, storeRoot: injectedStoreRoot, reachable: probe.reachable, error: probe.error };
    }
  } else {
    const opts: StoreRootOptions = storeOpts ?? { pointerFilePath: path.join(home, POINTER_REL) };
    const resolved = await resolveStoreRoot(opts);
    if (!resolved.ok) {
      store = { resolved: false, storeRoot: null, reachable: false, error: resolved.message };
    } else {
      const probe = await probeStore(resolved.storeRoot);
      store = { resolved: true, storeRoot: resolved.storeRoot, reachable: probe.reachable, error: probe.error };
    }
  }

  const storeRoot = store.storeRoot;
  const roots = await discoverClientRoots(home, storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined);
  const probeDir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-linkprobe-"));
  const linkTypes = await probeLinkTypes(probeDir);
  await rm(probeDir, { recursive: true, force: true });
  let ledger: LinkEntry[] = [];
  if (store.reachable && storeRoot !== null && storeRoot !== "") {
    ledger = await readLinksLedger(storeRoot).catch(() => []);
  }
  const danglingLinks = await findDanglingLinks(
    roots.map((r) => r.skillsDir),
    ledger,
  );
  return { store, roots: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })), linkTypes, danglingLinks };
}
