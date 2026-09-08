export type { SkillMeta, SkillHash, SkillSource, SkillSourceKind, SkillRecord, LinkScope } from "./types.js";
export type { StorageProvider, SourceProvider, ClientAdapter, IdentityProvider } from "./interfaces.js";
export { hashSkillFolder } from "./hash.js";
export { isGitHubUrl, parseGitHubUrl } from "./github-url.js";
export type { GitHubUrlParts } from "./github-url.js";
export { isSafeRelativePath, writeGitHubEntries } from "./github-files.js";
export type { GitHubFileEntry } from "./github-files.js";
export { parseSkillMeta, readSkillMeta } from "./skill-md.js";
export { discoverClientRoots, discoverClientRootsAt, isExcludedRoot, isOwnClientId } from "./clients.js";
export type { ClientRoot, DiscoverRootsOptions } from "./clients.js";
export { resolveStoreRoot, readPointerStoreRoot } from "./store-location.js";
export type { StoreRootOptions, StoreRootResolution, StoreRootSource } from "./store-location.js";
export {
  initializeStoreLayout,
  STORE_ARCHIVE_DIR,
  STORE_DATA_FILES,
  STORE_LAYOUT_VERSION,
  STORE_SKILLS_DIR,
  STORE_TMP_DIR,
} from "./store-layout.js";
export {
  createBackupSnapshot,
  listBackupSnapshots,
  materializeBackupSnapshot,
  readBackupManifest,
  readLatestSnapshotId,
  verifyBackupSnapshot,
  BACKUP_MANIFEST_VERSION,
  STORE_BACKUPS_DIR,
} from "./backup.js";
export {
  isBlobBackupManifest,
  previewRestoreClientSkills,
  restoreClientSkills,
  unlinkNoFollow,
} from "./backup-restore.js";
export type {
  BackupFileEntry,
  BackupLinkEntry,
  BackupManifest,
  BackupSnapshotResult,
  BackupSnapshotSummary,
  BackupVerifyIssue,
  BackupVerifyReport,
} from "./backup.js";
export type {
  RestoreFailed as ClientRestoreFailed,
  RestoreOk as ClientRestoreOk,
  RestorePreview,
  RestoreResult as ClientRestoreResult,
  RestoreSkillItem,
} from "./backup-restore.js";
export type { InitLayoutResult, StoreManifest } from "./store-layout.js";
export {
  adoptMany,
  adoptSkillFolder,
  readStoreIndex,
  readStoreIndexFile,
  writeStoreIndex,
  STORE_INDEX_VERSION,
} from "./store.js";
export type { AdoptionOutcome, AdoptionReport, AdoptInput, AdoptOptions, DraftRecord, StoreIndexFile } from "./store.js";
export { migrateVersionedData } from "./migrate.js";
export type { MigrationStep, MigrateOptions } from "./migrate.js";
export { allocateDraft, commitDraft, discardDraft, listDrafts, createAndCommit } from "./create.js";
export type { AllocateOutcome, CommitOutcome, DiscardOutcome } from "./create.js";
export { probeLinkTypes, readLinkTarget } from "./link-probe.js";
export { classifyClientLink, findDanglingLinks } from "./link-status.js";
export type { ClientLinkState, ClientLinkStatus } from "./link-status.js";
export type { DanglingLink, LinkTypeProbe } from "./link-probe.js";
export {
  attachVisibleIn,
  checkLinksLedger,
  LINKS_LEDGER_VERSION,
  queryLinksByClient,
  readLinksLedger,
  visibleInFromLedger,
  writeLinksLedger,
} from "./links.js";
export type { LinkEntry, LinkEntryCheck, LinkEntryKind, LinkEntryState, LinksLedgerFile } from "./links.js";
export { applyLinkSet } from "./link-switch.js";
export type { ApplyOptions, LinkSetFailed, LinkSetOk, LinkSetPlan, LinkSetResult } from "./link-switch.js";
export { archiveSkill, listArchivedSkills, restoreArchivedSkill } from "./archive.js";
export type { ArchivedSkill, ArchiveFailed, ArchiveOk, ArchiveResult, RestoreFailed, RestoreOk, RestoreResult } from "./archive.js";
export { crc32, unzipDirectory, zipDirectory, zipEntries } from "./zip.js";
export {
  addSkillToGroups,
  BUILTIN_GROUPS,
  createGroup,
  deleteGroup,
  ensureBuiltinGroups,
  groupsOfSkill,
  readGroups,
  removeSkillFromGroups,
  renameGroup,
  skillsOfGroup,
  writeGroups,
  GROUPS_FILE_VERSION,
} from "./groups.js";
export type { GroupDef, GroupsFile } from "./groups.js";
export { readUsageStats, recordUsage, usageRanking, STATS_FILE_VERSION } from "./stats.js";
export type { StatsFile, UsageCounters, UsageKind, UsageRankEntry } from "./stats.js";
export { listSkillFiles, readSkillFile, saveSkillFile, MAX_FILE_BYTES, MAX_TREE_ENTRIES } from "./skill-files.js";
export type { SkillFileEntry, SkillFileReadResult, SkillSaveResult, SkillTreeResult } from "./skill-files.js";
