import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAction } from "../actions/registry.js";
import { sortClientsForApps } from "../shell/apps-layout.js";
import { fetchArchive, fetchCatalog, fetchClientSkillStates } from "./api.js";
import { fileResourceKey, invalidateResource, invalidateResourcePrefix, treeResourceKey } from "./async-resource.js";
import {
  loadCatalogRefresh,
  loadCatalogSnapshot,
  patchClientStates,
  patchSkillVisibility,
  renameSkillHash,
  type CatalogLoadState,
  type CatalogSnapshot,
} from "./catalog.js";
import type {
  ArchivedSkill,
  ClientInfo,
  ClientSkillStatesResponse,
  DoctorResponse,
  GroupDef,
  SkillRecord,
  StatsResponse,
  UsageCounters,
} from "./types.js";

export type { CatalogLoadState };

export interface UseCatalogOptions {
  /** 应用 tab 可见时按选中应用拉行级开关。 */
  loadClientStates: boolean;
}

/** 远程目录状态与乐观写:页面只消费,不自己 setState。 */
export function useCatalog({ loadClientStates }: UseCatalogOptions) {
  const [status, setStatus] = useState<CatalogLoadState>("loading");
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [storeRoot, setStoreRoot] = useState("");
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [groups, setGroups] = useState<GroupDef[]>([]);
  const [usageByHash, setUsageByHash] = useState<Map<string, UsageCounters>>(new Map());
  const [ranking, setRanking] = useState<StatsResponse["ranking"]>([]);
  const [archived, setArchived] = useState<ArchivedSkill[]>([]);
  const [doctor, setDoctor] = useState<DoctorResponse | null>(null);
  const [latestSnapshotId, setLatestSnapshotId] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [focusedHash, setFocusedHash] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [clientStates, setClientStates] = useState<ClientSkillStatesResponse | null>(null);
  const [pendingHash, setPendingHash] = useState<string | null>(null);

  const applySnapshot = useCallback((snap: CatalogSnapshot): void => {
    const ordered = sortClientsForApps(snap.clients, snap.skills);
    setStoreRoot(snap.storeRoot);
    setSkills(snap.skills);
    setClients(ordered);
    setUsageByHash(new Map(Object.entries(snap.stats.stats.counters)));
    setRanking(snap.stats.ranking);
    setArchived(snap.archived);
    setDoctor(snap.doctor);
    setLatestSnapshotId(snap.backups?.latest ?? null);
    setSnapshotCount(snap.backups?.snapshots.length ?? 0);
    setGroups(snap.groups);
    setSelectedClientId((prev) => prev ?? ordered[0]?.clientId ?? null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadCatalogSnapshot()
      .then((snap) => {
        if (cancelled) return;
        applySnapshot(snap);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("offline");
      });
    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!loadClientStates || selectedClientId === null) return;
    let cancelled = false;
    void fetchClientSkillStates(selectedClientId)
      .then((s) => {
        if (!cancelled) setClientStates(s);
      })
      .catch(() => {
        if (!cancelled) setClientStates(null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadClientStates, selectedClientId]);

  const refresh = useCallback((): void => {
    void loadCatalogRefresh(selectedClientId).then((next) => {
      setStoreRoot(next.storeRoot);
      setSkills(next.skills);
      setGroups(next.groups);
      if (next.clientStates !== null) setClientStates(next.clientStates);
    });
  }, [selectedClientId]);

  const reload = useCallback((): void => {
    void loadCatalogSnapshot().then(applySnapshot);
  }, [applySnapshot]);

  const toggle = useCallback((skill: SkillRecord, clientId: string, enable: boolean): void => {
    void (async () => {
      setPendingHash(skill.hash);
      try {
        await getAction(enable ? "enable" : "disable").execute({ hash: skill.hash, clientId });
        setSkills((prev) => patchSkillVisibility(prev, skill.hash, clientId, enable));
        setClientStates((prev) => patchClientStates(prev, skill.hash, clientId, enable));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingHash(null);
      }
    })();
  }, []);

  const markSaved = useCallback((oldHash: string, newHash: string): void => {
    invalidateResource(treeResourceKey(oldHash));
    invalidateResourcePrefix(fileResourceKey(oldHash, ""));
    setSkills((prev) => renameSkillHash(prev, oldHash, newHash));
    setFocusedHash(newHash);
  }, []);

  const restore = useCallback((name: string): void => {
    void (async () => {
      try {
        await getAction("restore").execute({ name });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        toast("已恢复 " + name);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  const archive = useCallback((hash: string): void => {
    void (async () => {
      try {
        await getAction("archive").execute({ hash });
        setSkills((await fetchCatalog()).skills);
        setArchived(await fetchArchive());
        setFocusedHash(null);
        toast("已归档");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return {
    status,
    storeRoot,
    skills,
    clients,
    groups,
    usageByHash,
    ranking,
    archived,
    doctor,
    latestSnapshotId,
    snapshotCount,
    focusedHash,
    setFocusedHash,
    selectedClientId,
    setSelectedClientId,
    clientStates,
    pendingHash,
    toggle,
    markSaved,
    refresh,
    reload,
    restore,
    archive,
  };
}
