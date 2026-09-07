import {
  createBackupSnapshot,
  discoverClientRoots,
  listBackupSnapshots,
  previewRestoreClientSkills,
  readLatestSnapshotId,
  restoreClientSkills,
  verifyBackupSnapshot,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { emitError, emitOk } from "./json-out.js";
import { requireWriteAuth, resolveStoreRootOrFail } from "./store-cmds.js";

/**
 * backup 命令面(#117):create / list / verify。
 * 写盘只走 core.createBackupSnapshot;bootstrap 也调同一实现。
 */

export interface BackupArgs {
  home: string | undefined;
  yes: boolean | undefined;
  dryRun: boolean | undefined;
  json: boolean | undefined;
  full: boolean | undefined;
  _: (string | number)[];
}

export async function runBackup(args: BackupArgs): Promise<void> {
  const verb = args._[0] === undefined ? "" : String(args._[0]);
  if (verb === "list") {
    await runBackupList(args);
    return;
  }
  if (verb === "verify") {
    await runBackupVerify(args);
    return;
  }
  if (verb === "restore") {
    await runBackupRestore(args);
    return;
  }
  if (verb !== "") {
    emitError(args.json === true, "backup", "bad-usage", "用法: skills-hub backup [--full] | backup list | backup verify [snapshotId] | backup restore [snapshotId]");
    return;
  }
  await runBackupCreate(args);
}

async function runBackupCreate(args: BackupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "backup");
  if (storeRoot === null) return;
  const home = resolveHome(args.home);
  const mode = args.full === true ? "full" : "incremental";
  const roots = await discoverClientRoots(home, { storeRoot });
  const latest = await readLatestSnapshotId(storeRoot);

  if (args.dryRun === true) {
    if (args.json === true) {
      emitOk("backup", {
        dryRun: true,
        verb: "create",
        mode,
        storeRoot,
        home,
        clientRoots: roots.length,
        latestSnapshotId: latest,
      });
      return;
    }
    console.log(
      "预演:将备份 " + roots.length + " 个客户端 root 到 " + storeRoot + "/backups (" + mode + "),不写盘。",
    );
    return;
  }

  if (!requireWriteAuth(args, "backup")) return;

  const result = await createBackupSnapshot(storeRoot, home);
  if (args.json === true) {
    emitOk("backup", {
      verb: "create",
      mode,
      storeRoot,
      snapshotId: result.snapshotId,
      snapshotDir: result.snapshotDir,
      files: result.manifest.files.length,
      links: result.manifest.links.length,
      blobsWritten: result.manifest.blobsWritten,
      blobsReused: result.manifest.blobsReused,
    });
    return;
  }
  console.log(
    "✓ 快照 " + result.snapshotId +
      " (" + mode + "): " +
      result.manifest.files.length + " 个文件, " +
      result.manifest.links.length + " 条链接, 新增 blob " +
      result.manifest.blobsWritten + ", 复用 " +
      result.manifest.blobsReused,
  );
}

async function runBackupList(args: BackupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "backup");
  if (storeRoot === null) return;
  const latest = await readLatestSnapshotId(storeRoot);
  const snapshots = await listBackupSnapshots(storeRoot);
  if (args.json === true) {
    emitOk("backup", { verb: "list", storeRoot, latest, snapshots });
    return;
  }
  if (snapshots.length === 0) {
    console.log("尚无备份快照。skills-hub backup --yes 建第一份。");
    return;
  }
  console.log("备份快照(" + snapshots.length + "),最新: " + (latest ?? "(无)"));
  for (const s of snapshots) {
    console.log(
      "  " + s.snapshotId + "  文件 " + s.files + "  链接 " + s.links +
        "  新增blob " + s.blobsWritten + "  " + s.createdAt,
    );
  }
}

async function runBackupVerify(args: BackupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "backup");
  if (storeRoot === null) return;
  const snapshotId = args._[1] === undefined ? undefined : String(args._[1]);
  const report = snapshotId === undefined
    ? await verifyBackupSnapshot(storeRoot)
    : await verifyBackupSnapshot(storeRoot, snapshotId);

  if (report.snapshotId === "" && report.issues.some((i) => i.rel === "latest")) {
    emitError(args.json === true, "backup", "not-found", "没有可校验的备份快照。请先运行 skills-hub backup --yes");
    return;
  }

  if (!report.ok) {
    const message = "快照校验失败 " + report.snapshotId + ": " +
      report.issues.map((i) => i.rel + "(" + i.reason + ")").join(", ");
    if (args.json === true) {
      console.log(JSON.stringify({
        ok: false,
        command: "backup",
        code: "verify-failed",
        message,
        verb: "verify",
        snapshotId: report.snapshotId,
        checked: report.checked,
        issues: report.issues,
      }));
    }
    console.error(message);
    process.exitCode = 2;
    return;
  }

  if (args.json === true) {
    emitOk("backup", {
      verb: "verify",
      storeRoot,
      snapshotId: report.snapshotId,
      checked: report.checked,
      passed: true,
      issues: report.issues,
    });
    return;
  }
  console.log("✓ 快照 " + report.snapshotId + " 校验通过,核对 " + report.checked + " 个 blob。");
}

async function runBackupRestore(args: BackupArgs): Promise<void> {
  const storeRoot = await resolveStoreRootOrFail(args, "backup");
  if (storeRoot === null) return;
  const home = resolveHome(args.home);
  const snapshotId = args._[1] === undefined ? undefined : String(args._[1]);
  const preview = snapshotId === undefined
    ? await previewRestoreClientSkills(storeRoot, home)
    : await previewRestoreClientSkills(storeRoot, home, snapshotId);
  if (!preview.ok) {
    emitError(args.json === true, "backup", preview.code, preview.message);
    return;
  }
  if (args.dryRun === true) {
    if (args.json === true) {
      emitOk("backup", {
        dryRun: true,
        verb: "restore",
        storeRoot,
        snapshotId: preview.snapshotId,
        clients: preview.clients,
        skills: preview.skills,
        files: preview.files,
        links: preview.links,
        wouldRestore: preview.wouldRestore,
        skippedOwnDirs: preview.skippedOwnDirs,
      });
      return;
    }
    console.log("预演:将按快照 " + preview.snapshotId + " 还原 " + preview.skills + " 个 skill,不写盘。");
    return;
  }
  if (!requireWriteAuth(args, "backup")) return;
  const result = snapshotId === undefined
    ? await restoreClientSkills(storeRoot, home)
    : await restoreClientSkills(storeRoot, home, snapshotId);
  if (!result.ok) {
    emitError(args.json === true, "backup", result.code, result.message);
    return;
  }
  if (args.json === true) {
    emitOk("backup", {
      verb: "restore",
      storeRoot,
      snapshotId: result.snapshotId,
      clients: result.clients,
      skills: result.skills,
      files: result.files,
      links: result.links,
    });
    return;
  }
  console.log("✓ 已按快照 " + result.snapshotId + " 还原 " + result.skills + " 个 skill。");
}
