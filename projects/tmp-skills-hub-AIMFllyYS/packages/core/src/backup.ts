import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverClientRoots } from "./clients.js";
import { readLinkTarget } from "./link-probe.js";
import { isIgnoredSkillEntry } from "./skill-ignore.js";
import { STORE_TMP_DIR } from "./store-layout.js";

/** 备份区(与 skills/ archive/ tmp 并列)。 */
export const STORE_BACKUPS_DIR = "backups";
export const BACKUP_MANIFEST_VERSION = 1;

export interface BackupFileEntry {
  clientId: string;
  rel: string;
  hash: string;
  size: number;
  mtimeMs: number;
}

export interface BackupLinkEntry {
  clientId: string;
  rel: string;
  kind: "symlink" | "junction";
  target: string;
  inStore: boolean;
}

export interface BackupManifest {
  version: number;
  snapshotId: string;
  createdAt: string;
  files: BackupFileEntry[];
  links: BackupLinkEntry[];
  blobsWritten: number;
  blobsReused: number;
}

export interface BackupSnapshotResult {
  snapshotId: string;
  snapshotDir: string;
  blobsDir: string;
  manifest: BackupManifest;
}

export interface BackupVerifyIssue {
  hash: string;
  rel: string;
  reason: "missing" | "mismatch";
}

export interface BackupVerifyReport {
  ok: boolean;
  snapshotId: string;
  checked: number;
  issues: BackupVerifyIssue[];
}

function sha256(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex");
}

function isInside(inner: string, outer: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function existsFile(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isFile();
  } catch {
    return false;
  }
}

async function writeAtomic(target: string, data: Uint8Array | string, tmpRoot: string): Promise<void> {
  await mkdir(tmpRoot, { recursive: true });
  const tmp = path.join(tmpRoot, "bak." + process.pid + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
  if (typeof data === "string") await writeFile(tmp, data, "utf8");
  else await writeFile(tmp, data);
  await mkdir(path.dirname(target), { recursive: true });
  await rename(tmp, target);
}

async function putBlob(blobsDir: string, tmpRoot: string, hash: string, buf: Uint8Array): Promise<"written" | "reused"> {
  const dest = path.join(blobsDir, hash);
  if (await existsFile(dest)) return "reused";
  await writeAtomic(dest, buf, tmpRoot);
  return "written";
}

/**
 * 内容寻址备份(#116)。源目录只读。
 * 不把链接当目录走进去;库存内目标只记引用,库存外目标复制内容一次。
 * blobs 是 backups/blobs 共享池,快照只有 manifest。
 */
export async function createBackupSnapshot(storeRoot: string, home: string): Promise<BackupSnapshotResult> {
  const backupsRoot = path.join(storeRoot, STORE_BACKUPS_DIR);
  const blobsDir = path.join(backupsRoot, "blobs");
  const tmpRoot = path.join(storeRoot, STORE_TMP_DIR);
  await mkdir(blobsDir, { recursive: true });
  const snapshotId = new Date().toISOString().replace(/[:]/g, "-");
  const snapshotDir = path.join(backupsRoot, snapshotId);
  const realStore = await realpath(storeRoot).catch(() => path.resolve(storeRoot));
  const roots = await discoverClientRoots(home, { storeRoot });
  const files: BackupFileEntry[] = [];
  const links: BackupLinkEntry[] = [];
  let blobsWritten = 0;
  let blobsReused = 0;

  const ingestFile = async (abs: string, clientId: string, rel: string): Promise<void> => {
    const st = await lstat(abs);
    const buf = await readFile(abs);
    const hash = sha256(buf);
    const put = await putBlob(blobsDir, tmpRoot, hash, buf);
    if (put === "written") blobsWritten += 1;
    else blobsReused += 1;
    files.push({ clientId, rel, hash, size: buf.length, mtimeMs: st.mtimeMs });
  };

  const walk = async (abs: string, clientId: string, rel: string): Promise<void> => {
    const target = await readLinkTarget(abs);
    if (target !== null) {
      const realTarget = await realpath(target).catch(() => target);
      const inStore = isInside(realTarget, realStore);
      const st = await lstat(abs);
      const kind: BackupLinkEntry["kind"] = process.platform === "win32" && st.isDirectory() && !st.isSymbolicLink() ? "junction" : "symlink";
      links.push({ clientId, rel, kind, target: realTarget, inStore });
      if (inStore) return;
      try {
        const tst = await lstat(realTarget);
        if (tst.isFile()) await ingestFile(realTarget, clientId, rel);
        else if (tst.isDirectory()) {
          const names = (await readdir(realTarget)).sort();
          for (const name of names) {
            if (isIgnoredSkillEntry(name)) continue;
            await walk(path.join(realTarget, name), clientId, rel + "/" + name);
          }
        }
      } catch {
        /* 悬空链接:只记清单 */
      }
      return;
    }
    const st = await lstat(abs);
    if (st.isDirectory()) {
      const names = (await readdir(abs)).sort();
      for (const name of names) {
        if (isIgnoredSkillEntry(name)) continue;
        const nextRel = rel === "" ? name : rel + "/" + name;
        await walk(path.join(abs, name), clientId, nextRel);
      }
      return;
    }
    if (st.isFile()) await ingestFile(abs, clientId, rel);
  };

  for (const root of roots) {
    await walk(root.skillsDir, root.clientId, "");
  }

  const manifest: BackupManifest = {
    version: BACKUP_MANIFEST_VERSION,
    snapshotId,
    createdAt: new Date().toISOString(),
    files,
    links,
    blobsWritten,
    blobsReused,
  };
  await mkdir(snapshotDir, { recursive: true });
  await writeAtomic(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", tmpRoot);
  await writeAtomic(path.join(backupsRoot, "latest"), snapshotId + "\n", tmpRoot);
  return { snapshotId, snapshotDir, blobsDir, manifest };
}

export async function readLatestSnapshotId(storeRoot: string): Promise<string | null> {
  try {
    const raw = (await readFile(path.join(storeRoot, STORE_BACKUPS_DIR, "latest"), "utf8")).trim();
    return raw === "" ? null : raw;
  } catch {
    return null;
  }
}

export interface BackupSnapshotSummary {
  snapshotId: string;
  createdAt: string;
  files: number;
  links: number;
  blobsWritten: number;
  blobsReused: number;
}

/** 列 backups/ 下的快照(跳过 blobs/ 与 latest)。按 createdAt 新→旧。 */
export async function listBackupSnapshots(storeRoot: string): Promise<BackupSnapshotSummary[]> {
  const root = path.join(storeRoot, STORE_BACKUPS_DIR);
  let names: string[];
  try {
    names = await readdir(root);
  } catch {
    return [];
  }
  const out: BackupSnapshotSummary[] = [];
  for (const name of names) {
    if (name === "blobs" || name === "latest") continue;
    const dir = path.join(root, name);
    try {
      const st = await lstat(dir);
      if (!st.isDirectory()) continue;
      const raw = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8")) as Record<string, unknown>;
      if (Array.isArray(raw.files) && Array.isArray(raw.links) && typeof raw.snapshotId === "string") {
        const m = raw as unknown as BackupManifest;
        out.push({
          snapshotId: m.snapshotId,
          createdAt: m.createdAt,
          files: m.files.length,
          links: m.links.length,
          blobsWritten: m.blobsWritten,
          blobsReused: m.blobsReused,
        });
      } else {
        out.push({
          snapshotId: typeof raw.snapshotId === "string" ? raw.snapshotId : name,
          createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
          files: typeof raw.skillDirs === "number" ? raw.skillDirs : 0,
          links: 0,
          blobsWritten: 0,
          blobsReused: 0,
        });
      }
    } catch {
      /* 残缺目录跳过 */
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

export async function readBackupManifest(snapshotDir: string): Promise<BackupManifest> {
  const raw = JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8")) as BackupManifest;
  return raw;
}

/** 按 manifest 重算 blob 哈希。不改源目录。 */
export async function verifyBackupSnapshot(storeRoot: string, snapshotId?: string): Promise<BackupVerifyReport> {
  const id = snapshotId ?? (await readLatestSnapshotId(storeRoot));
  if (id === null) return { ok: false, snapshotId: "", checked: 0, issues: [{ hash: "", rel: "latest", reason: "missing" }] };
  const snapshotDir = path.join(storeRoot, STORE_BACKUPS_DIR, id);
  const raw = JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8")) as unknown;
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as BackupManifest).files)) {
    try {
      const st = await lstat(path.join(snapshotDir, "roots"));
      if (st.isDirectory()) return { ok: true, snapshotId: id, checked: 0, issues: [] };
    } catch {
      /* 旧格式缺 roots */
    }
    return { ok: false, snapshotId: id, checked: 0, issues: [{ hash: "", rel: "roots", reason: "missing" }] };
  }
  const manifest = raw as BackupManifest;
  const blobsDir = path.join(storeRoot, STORE_BACKUPS_DIR, "blobs");
  const issues: BackupVerifyIssue[] = [];
  for (const f of manifest.files) {
    const blob = path.join(blobsDir, f.hash);
    if (!(await existsFile(blob))) {
      issues.push({ hash: f.hash, rel: f.rel, reason: "missing" });
      continue;
    }
    const actual = sha256(await readFile(blob));
    if (actual !== f.hash) issues.push({ hash: f.hash, rel: f.rel, reason: "mismatch" });
  }
  return { ok: issues.length === 0, snapshotId: id, checked: manifest.files.length, issues };
}

/** 测试用:按 manifest 拼回目录(不写源)。 */
export async function materializeBackupSnapshot(snapshotDir: string, destRoot: string, blobsDir: string): Promise<void> {
  const manifest = await readBackupManifest(snapshotDir);
  for (const f of manifest.files) {
    const dest = path.join(destRoot, f.clientId, ...f.rel.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, await readFile(path.join(blobsDir, f.hash)));
  }
}

export async function removeBackupTmp(storeRoot: string): Promise<void> {
  const tmp = path.join(storeRoot, STORE_TMP_DIR);
  const names = await readdir(tmp).catch(() => []);
  for (const n of names) {
    if (n.startsWith("bak.")) await rm(path.join(tmp, n), { force: true });
  }
}
