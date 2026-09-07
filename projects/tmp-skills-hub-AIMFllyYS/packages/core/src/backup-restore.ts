import { cp, lstat, mkdir, readdir, readFile, rename, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { discoverClientRoots, isOwnClientId } from "./clients.js";
import { readLinkTarget } from "./link-probe.js";
import { STORE_TMP_DIR } from "./store-layout.js";
import {
  readLatestSnapshotId,
  STORE_BACKUPS_DIR,
  verifyBackupSnapshot,
  type BackupFileEntry,
  type BackupLinkEntry,
  type BackupManifest,
  type BackupVerifyIssue,
} from "./backup.js";

function skillNameOf(rel: string): string {
  const first = rel.split("/").find((s) => s !== "");
  return first ?? "";
}

export function isBlobBackupManifest(raw: unknown): raw is BackupManifest {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as Record<string, unknown>;
  return Array.isArray(m.files) && Array.isArray(m.links) && typeof m.snapshotId === "string";
}

export interface RestoreSkillItem {
  clientId: string;
  skill: string;
  dest: string;
  kind: "files" | "link";
  fileCount: number;
  linkTarget?: string;
}

export interface RestorePreview {
  snapshotId: string;
  format: "blobs" | "roots";
  clients: number;
  skills: number;
  files: number;
  links: number;
  wouldRestore: RestoreSkillItem[];
  skippedOwnDirs: string[];
}

export interface RestoreOk extends RestorePreview {
  ok: true;
  asideDir: string;
}

export interface RestoreFailed {
  ok: false;
  code: "not-found" | "verify-failed" | "restore-failed";
  message: string;
  snapshotId: string;
  issues?: BackupVerifyIssue[];
}

export type RestoreResult = RestoreOk | RestoreFailed;

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function readRawManifest(snapshotDir: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(snapshotDir, "manifest.json"), "utf8")) as unknown;
}

/** 摘链接不跟随;普通目录逐条摘内部链接后再删。 */
export async function unlinkNoFollow(p: string): Promise<void> {
  if (!(await exists(p))) return;
  if ((await readLinkTarget(p)) !== null) {
    await unlink(p);
    return;
  }
  const st = await lstat(p);
  if (st.isDirectory()) {
    const names = await readdir(p);
    for (const name of names) await unlinkNoFollow(path.join(p, name));
    await rm(p, { recursive: false });
    return;
  }
  await unlink(p);
}

/** 链接摘掉不跟随;普通目录先 rename 到库存 tmp,跨卷再落到同盘旁路。 */
async function asideSkill(src: string, storeAside: string, localAside: string, name: string): Promise<void> {
  if ((await readLinkTarget(src)) !== null) {
    await unlinkNoFollow(src);
    return;
  }
  const storeDest = path.join(storeAside, name);
  await mkdir(path.dirname(storeDest), { recursive: true });
  try {
    await rename(src, storeDest);
    return;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "EXDEV") throw e;
  }
  const localDest = path.join(localAside, name);
  await mkdir(path.dirname(localDest), { recursive: true });
  try {
    await rename(src, localDest);
    return;
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "EXDEV") throw e;
  }
  await cp(src, storeDest, { recursive: true, verbatimSymlinks: true });
  await unlinkNoFollow(src);
}

async function resolveSkillsDir(
  home: string,
  storeRoot: string,
  clientId: string,
  skill: string,
): Promise<string> {
  const roots = await discoverClientRoots(home, { storeRoot });
  const matches = roots.filter((r) => r.clientId === clientId);
  if (matches.length === 0) return path.join(home, "." + clientId, "skills");
  if (matches.length === 1) return matches[0]!.skillsDir;
  for (const r of matches) {
    if (await exists(path.join(r.skillsDir, skill))) return r.skillsDir;
  }
  const canonical = matches.find((r) => {
    const n = r.skillsDir.replace(/\\/g, "/");
    return n.endsWith("/skills") && !n.includes("skills-cursor") && !n.includes("antigravity");
  });
  return (canonical ?? matches[0]!).skillsDir;
}

function snapshotDirOf(storeRoot: string, snapshotId: string): string {
  return path.join(storeRoot, STORE_BACKUPS_DIR, snapshotId);
}

export async function resolveRestoreSnapshotId(storeRoot: string, snapshotId?: string): Promise<string | null> {
  if (snapshotId !== undefined && snapshotId !== "") return snapshotId;
  return readLatestSnapshotId(storeRoot);
}

async function previewBlob(
  storeRoot: string,
  home: string,
  snapshotId: string,
  manifest: BackupManifest,
): Promise<RestorePreview> {
  const skippedOwnDirs: string[] = [];
  const bySkill = new Map<string, { files: BackupFileEntry[]; link: BackupLinkEntry | undefined }>();
  const add = (clientId: string, skill: string): { files: BackupFileEntry[]; link: BackupLinkEntry | undefined } => {
    const key = clientId + "\0" + skill;
    const cur = bySkill.get(key);
    if (cur !== undefined) return cur;
    const created = { files: [] as BackupFileEntry[], link: undefined as BackupLinkEntry | undefined };
    bySkill.set(key, created);
    return created;
  };
  for (const f of manifest.files) {
    if (isOwnClientId(f.clientId)) {
      if (!skippedOwnDirs.includes(f.clientId)) skippedOwnDirs.push(f.clientId);
      continue;
    }
    const skill = skillNameOf(f.rel);
    if (skill === "") continue;
    add(f.clientId, skill).files.push(f);
  }
  for (const l of manifest.links) {
    if (isOwnClientId(l.clientId)) {
      if (!skippedOwnDirs.includes(l.clientId)) skippedOwnDirs.push(l.clientId);
      continue;
    }
    const skill = skillNameOf(l.rel);
    if (skill === "" || skill !== l.rel) continue;
    add(l.clientId, skill).link = l;
  }
  const wouldRestore: RestoreSkillItem[] = [];
  for (const [key, group] of bySkill) {
    const [clientId, skill] = key.split("\0");
    if (clientId === undefined || skill === undefined) continue;
    const skillsDir = await resolveSkillsDir(home, storeRoot, clientId, skill);
    const dest = path.join(skillsDir, skill);
    if (group.link !== undefined) {
      wouldRestore.push({
        clientId,
        skill,
        dest,
        kind: "link",
        fileCount: 0,
        linkTarget: group.link.target,
      });
    } else {
      wouldRestore.push({ clientId, skill, dest, kind: "files", fileCount: group.files.length });
    }
  }
  const clients = new Set(wouldRestore.map((i) => i.clientId)).size;
  return {
    snapshotId,
    format: "blobs",
    clients,
    skills: wouldRestore.length,
    files: wouldRestore.reduce((n, i) => n + i.fileCount, 0),
    links: wouldRestore.filter((i) => i.kind === "link").length,
    wouldRestore,
    skippedOwnDirs,
  };
}

async function previewRoots(snapshotDir: string, home: string, snapshotId: string): Promise<RestorePreview> {
  const rootsDir = path.join(snapshotDir, "roots");
  const skippedOwnDirs: string[] = [];
  const wouldRestore: RestoreSkillItem[] = [];
  const clientNames = await readdir(rootsDir).catch(() => [] as string[]);
  for (const clientId of clientNames) {
    if (isOwnClientId(clientId)) {
      skippedOwnDirs.push(clientId);
      continue;
    }
    const clientSnap = path.join(rootsDir, clientId);
    if (!(await isDir(clientSnap))) continue;
    const dots = await readdir(clientSnap);
    for (const dot of dots) {
      if (isOwnClientId(dot.replace(/^\.+/, ""))) {
        if (!skippedOwnDirs.includes(dot)) skippedOwnDirs.push(dot);
        continue;
      }
      for (const relSkills of ["skills", "skills-cursor", "antigravity/skills"]) {
        const srcSkills = path.join(clientSnap, dot, ...relSkills.split("/"));
        if (!(await isDir(srcSkills))) continue;
        const destSkills = path.join(home, dot, ...relSkills.split("/"));
        const names = await readdir(srcSkills);
        for (const skill of names) {
          const src = path.join(srcSkills, skill);
          const st = await lstat(src).catch(() => null);
          if (st === null || (!st.isDirectory() && !st.isSymbolicLink())) continue;
          wouldRestore.push({
            clientId,
            skill,
            dest: path.join(destSkills, skill),
            kind: "files",
            fileCount: 1,
          });
        }
      }
    }
  }
  return {
    snapshotId,
    format: "roots",
    clients: new Set(wouldRestore.map((i) => i.clientId)).size,
    skills: wouldRestore.length,
    files: wouldRestore.length,
    links: 0,
    wouldRestore,
    skippedOwnDirs,
  };
}

export async function previewRestoreClientSkills(
  storeRoot: string,
  home: string,
  snapshotId?: string,
): Promise<RestoreResult> {
  const id = await resolveRestoreSnapshotId(storeRoot, snapshotId);
  if (id === null) {
    return { ok: false, code: "not-found", message: "没有可还原的备份快照", snapshotId: "" };
  }
  const snapshotDir = snapshotDirOf(storeRoot, id);
  if (!(await exists(path.join(snapshotDir, "manifest.json")))) {
    return { ok: false, code: "not-found", message: "快照不存在: " + id, snapshotId: id };
  }
  const report = await verifyBackupSnapshot(storeRoot, id);
  if (!report.ok) {
    return {
      ok: false,
      code: "verify-failed",
      message: "快照校验失败: " + id,
      snapshotId: id,
      issues: report.issues,
    };
  }
  const raw = await readRawManifest(snapshotDir);
  const preview = isBlobBackupManifest(raw)
    ? await previewBlob(storeRoot, home, id, raw)
    : await previewRoots(snapshotDir, home, id);
  return { ok: true, asideDir: "", ...preview };
}

async function writeBlobFiles(
  storeRoot: string,
  destSkill: string,
  files: BackupFileEntry[],
): Promise<void> {
  const blobsDir = path.join(storeRoot, STORE_BACKUPS_DIR, "blobs");
  await mkdir(destSkill, { recursive: true });
  for (const f of files) {
    const dest = path.join(path.dirname(destSkill), ...f.rel.split("/"));
    await mkdir(path.dirname(dest), { recursive: true });
    const buf = await readFile(path.join(blobsDir, f.hash));
    await writeFile(dest, buf);
    if (Number.isFinite(f.mtimeMs)) await utimes(dest, new Date(f.mtimeMs), new Date(f.mtimeMs));
  }
}

async function recreateLink(dest: string, target: string, _kind: BackupLinkEntry["kind"]): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  if (await exists(dest)) await unlinkNoFollow(dest);
  // Windows 目录链接优先 junction,避免把 junction 误判成需提权的 symlink。
  const type = process.platform === "win32" ? "junction" : "dir";
  await symlink(target, dest, type);
}

async function applyBlobRestore(
  storeRoot: string,
  home: string,
  snapshotId: string,
  manifest: BackupManifest,
  preview: RestorePreview,
): Promise<void> {
  const asideRoot = path.join(storeRoot, STORE_TMP_DIR, "restore-aside-" + snapshotId);
  for (const item of preview.wouldRestore) {
    if (await exists(item.dest)) {
      const localAside = path.join(path.dirname(path.dirname(item.dest)), ".skills-hub.restore-aside", snapshotId);
      await asideSkill(item.dest, asideRoot, localAside, item.clientId + "-" + item.skill);
    }
    if (item.kind === "link" && item.linkTarget !== undefined) {
      const link = manifest.links.find((l) => l.clientId === item.clientId && l.rel === item.skill);
      await recreateLink(item.dest, item.linkTarget, link?.kind ?? "junction");
      continue;
    }
    const files = manifest.files.filter((f) => f.clientId === item.clientId && skillNameOf(f.rel) === item.skill);
    await writeBlobFiles(storeRoot, item.dest, files);
  }
}

async function applyRootsRestore(storeRoot: string, snapshotDir: string, preview: RestorePreview): Promise<void> {
  const rootsDir = path.join(snapshotDir, "roots");
  const asideRoot = path.join(storeRoot, STORE_TMP_DIR, "restore-aside-" + preview.snapshotId);
  for (const item of preview.wouldRestore) {
    const destSkills = path.dirname(item.dest);
    const srcGuess = await findOldSkillSrc(rootsDir, item);
    if (srcGuess === null) continue;
    if (await exists(item.dest)) {
      const localAside = path.join(path.dirname(destSkills), ".skills-hub.restore-aside", preview.snapshotId);
      await asideSkill(item.dest, asideRoot, localAside, item.clientId + "-" + item.skill);
    }
    await mkdir(destSkills, { recursive: true });
    await cp(srcGuess, item.dest, { recursive: true, verbatimSymlinks: true });
  }
}

async function findOldSkillSrc(rootsDir: string, item: RestoreSkillItem): Promise<string | null> {
  const clientSnap = path.join(rootsDir, item.clientId);
  const dots = await readdir(clientSnap).catch(() => [] as string[]);
  for (const dot of dots) {
    for (const relSkills of ["skills", "skills-cursor", "antigravity/skills"]) {
      const src = path.join(clientSnap, dot, ...relSkills.split("/"), item.skill);
      if (await exists(src)) {
        const destNorm = item.dest.replace(/\\/g, "/");
        const suffix = (relSkills + "/" + item.skill).replace(/\\/g, "/");
        if (destNorm.endsWith(suffix) || destNorm.endsWith(item.skill)) return src;
      }
    }
  }
  return null;
}

/** 按快照逐条写回客户端 skill 落点。禁止整目录 rename 客户端 skills。 */
export async function restoreClientSkills(
  storeRoot: string,
  home: string,
  snapshotId?: string,
): Promise<RestoreResult> {
  const preview = await previewRestoreClientSkills(storeRoot, home, snapshotId);
  if (!preview.ok) return preview;
  const snapshotDir = snapshotDirOf(storeRoot, preview.snapshotId);
  const asideDir = path.join(storeRoot, STORE_TMP_DIR, "restore-aside-" + preview.snapshotId);
  try {
    const raw = await readRawManifest(snapshotDir);
    if (isBlobBackupManifest(raw)) await applyBlobRestore(storeRoot, home, preview.snapshotId, raw, preview);
    else await applyRootsRestore(storeRoot, snapshotDir, preview);
  } catch (e) {
    return {
      ok: false,
      code: "restore-failed",
      message: e instanceof Error ? e.message : String(e),
      snapshotId: preview.snapshotId,
    };
  }
  return { ...preview, asideDir };
}
