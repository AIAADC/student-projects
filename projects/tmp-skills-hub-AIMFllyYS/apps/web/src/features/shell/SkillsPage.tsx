import { useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input, NativeSelect } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { TruncateTip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getAction } from "../actions/registry.js";
import { AdoptForm } from "../skills/AdoptForm.js";
import { ArchivePanel } from "../skills/ArchivePanel.js";
import { CreateForm } from "../skills/CreateForm.js";
import { fallbackClientState } from "../skills/client-view.js";
import { VirtualSkillList } from "../skills/VirtualSkillList.js";
import { formatBatchResult } from "../skills/batch-links.js";
import { ALL_GROUP, applyFilters } from "../skills/filters.js";
import { GroupManager } from "../skills/GroupManager.js";
import { SkillActions } from "../skills/SkillActions.js";
import { SkillViewer } from "../skills/SkillViewer.js";
import type { ArchivedSkill, ClientInfo, ClientSkillStatesResponse, GroupDef, SkillRecord } from "../skills/types.js";
import { appsCoverageHint, enabledCountForClient, sortClientsForApps } from "./apps-layout.js";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { SkillsTab } from "./page.js";

const SKILLS_TABS: SegmentedTabItem<SkillsTab>[] = [
  { id: "apps", label: "应用", testId: "skills-tab-apps" },
  { id: "content", label: "内容", testId: "skills-tab-content" },
];

interface SkillsPageProps {
  tab: SkillsTab;
  onTab: (tab: SkillsTab) => void;
  skills: SkillRecord[];
  clients: ClientInfo[];
  groups: GroupDef[];
  archived: ArchivedSkill[];
  focusedHash: string | null;
  onFocus: (hash: string) => void;
  pendingHash: string | null;
  clientStates: ClientSkillStatesResponse | null;
  selectedClientId: string | null;
  onSelectClient: (id: string) => void;
  onToggle: (skill: SkillRecord, clientId: string, enable: boolean) => void;
  onSaved: (oldHash: string, newHash: string) => void;
  onRefresh: () => void;
  onRestore: (name: string) => void;
  onArchive: (hash: string) => void;
  onNotice: (text: string) => void;
}

/** Skills 管理:应用 / 内容两个全幅 tab。 */
export function SkillsPage({
  tab,
  onTab,
  skills,
  clients,
  groups,
  archived,
  focusedHash,
  onFocus,
  pendingHash,
  clientStates,
  selectedClientId,
  onSelectClient,
  onToggle,
  onSaved,
  onRefresh,
  onRestore,
  onArchive,
  onNotice,
}: SkillsPageProps): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState(ALL_GROUP);
  const [showArchive, setShowArchive] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<{
    action: "enable" | "disable";
    clientIds: string[];
    add: number;
    remove: number;
    conflicts: number;
  } | null>(null);
  const listed = useMemo(
    () => applyFilters(skills, groups, { query, sourceKind: "all", groupId }),
    [skills, groups, query, groupId],
  );
  const orderedClients = useMemo(() => sortClientsForApps(clients, skills), [clients, skills]);
  const focused = focusedHash === null ? null : (skills.find((s) => s.hash === focusedHash) ?? null);
  const clientId = selectedClientId ?? orderedClients[0]?.clientId ?? null;
  const allClientIds = orderedClients.map((c) => c.clientId);
  const allHashes = skills.map((s) => s.hash);
  const enabledHere = clientId === null
    ? 0
    : (clientStates?.clientId === clientId ? clientStates.enabled : enabledCountForClient(skills, clientId));

  const startBulk = async (action: "enable" | "disable", clientIds: string[]): Promise<void> => {
    if (allHashes.length === 0 || clientIds.length === 0) {
      onNotice("没有可操作的 skill 或应用。");
      return;
    }
    setBulkBusy(true);
    try {
      const preview = await getAction("preview-links").execute({ hashes: allHashes, clientIds, action });
      const n = action === "enable" ? preview.add : preview.remove;
      if (n === 0) {
        onNotice(
          preview.conflictCount > 0
            ? "没有可变更的项（" + String(preview.conflictCount) + " 处被本地目录占用）"
            : "没有需要变更的项",
        );
        return;
      }
      setConfirm({
        action,
        clientIds,
        add: preview.add,
        remove: preview.remove,
        conflicts: preview.conflictCount,
      });
    } catch (e) {
      onNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const runConfirmedBulk = async (): Promise<void> => {
    if (confirm === null) return;
    setBulkBusy(true);
    try {
      const result = await getAction("apply-clean-links").execute({
        hashes: allHashes,
        clientIds: confirm.clientIds,
        action: confirm.action,
      });
      setConfirm(null);
      onNotice(formatBatchResult(confirm.action, result.created.length, result.removed.length, result.skipped));
      onRefresh();
    } catch (e) {
      onNotice(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="skills-page">
      <header className="shrink-0 border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">Skills 管理</h1>
          <SegmentedTabs ariaLabel="Skills 管理页签" value={tab} onChange={onTab} items={SKILLS_TABS} />
        </div>
      </header>

      {tab === "apps" && (
        <div className="motion-enter flex min-h-0 flex-1" data-testid="skills-apps-pane">
          <div className="flex w-52 shrink-0 flex-col border-r border-line">
            <ScrollArea className="min-h-0 flex-1 py-2">
              {orderedClients.length === 0 && <p className="px-4 py-3 text-sm text-ink-mid">未发现应用</p>}
              {orderedClients.map((c) => {
                const n = enabledCountForClient(skills, c.clientId);
                const selected = clientId === c.clientId;
                return (
                  <button
                    key={c.clientId}
                    type="button"
                    onClick={() => onSelectClient(c.clientId)}
                    className={cn(
                      "motion-row mx-2 mb-0.5 flex w-[calc(100%-1rem)] items-center justify-between gap-2 rounded-lg px-3 py-2 text-left",
                      selected ? "bg-surface text-ink-strong" : "text-ink-mid hover:bg-surface",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", n > 0 ? "bg-green-700" : "bg-line")}
                        aria-hidden
                      />
                      <TruncateTip text={c.clientId} className="min-w-0 flex-1 text-sm" />
                    </span>
                    <Badge>{String(n)}</Badge>
                  </button>
                );
              })}
            </ScrollArea>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {clientId === null ? (
              <p className="px-6 py-6 text-sm text-ink-mid">没有可管理的应用。</p>
            ) : (
              <>
                <div className="shrink-0 border-b border-line px-4 py-3">
                  <TruncateTip text={clientId} className="text-sm font-medium text-ink-strong" />
                  <p className="mt-1 text-xs text-ink-mid">{appsCoverageHint(enabledHere, skills.length)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-testid="bulk-enable-client"
                      disabled={bulkBusy}
                      onClick={() => void startBulk("enable", [clientId])}
                    >
                      全部启用
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      data-testid="bulk-disable-client"
                      disabled={bulkBusy || enabledHere === 0}
                      onClick={() => void startBulk("disable", [clientId])}
                    >
                      全部停用
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="bulk-enable-all"
                      disabled={bulkBusy || allClientIds.length === 0}
                      onClick={() => void startBulk("enable", allClientIds)}
                    >
                      启用到全部应用
                    </Button>
                  </div>
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索名称 / 描述…"
                    data-testid="apps-skill-search"
                    className="mt-3"
                  />
                </div>
                <VirtualSkillList
                  skills={listed}
                  clientTotal={clients.length}
                  focusedHash={null}
                  onFocus={() => undefined}
                  clientViewOf={(skill) => {
                    const row = clientStates?.clientId === clientId
                      ? clientStates.rows.find((r) => r.hash === skill.hash)
                      : undefined;
                    const state = row?.state ?? fallbackClientState(skill.visibleIn, clientId);
                    return {
                      state,
                      detail: row?.detail ?? (state === "managed" ? "已启用" : "未启用"),
                      pending: pendingHash === skill.hash,
                      onToggle: (en) => onToggle(skill, clientId, en),
                    };
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {tab === "content" && (
        <div className="motion-enter flex min-h-0 flex-1 flex-col" data-testid="skills-content-pane" role="tabpanel">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索名称 / 描述…"
              className="min-w-48 flex-1"
            />
            <NativeSelect
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              aria-label="按分组过滤"
              className="w-40"
            >
              <option value={ALL_GROUP}>全部分组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </NativeSelect>
            <GroupManager groups={groups} onChanged={onRefresh} onNotice={onNotice} />
            <AdoptForm clientIds={allClientIds} onDone={onRefresh} onNotice={onNotice} />
            <CreateForm clientIds={allClientIds} onDone={onRefresh} onNotice={onNotice} />
          </div>
          <div className="flex min-h-0 flex-1">
            <div className="flex w-64 shrink-0 flex-col border-r border-line">
              <VirtualSkillList
                skills={listed}
                clientTotal={clients.length}
                focusedHash={focusedHash}
                onFocus={onFocus}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {focused === null ? (
                <div className="flex flex-col items-start gap-3 px-6 py-6">
                  <p className="text-sm text-ink-mid">从左侧选一个 skill 查看内容。</p>
                  <div className="flex flex-wrap gap-2">
                    <AdoptForm clientIds={allClientIds} onDone={onRefresh} onNotice={onNotice} />
                    <CreateForm clientIds={allClientIds} onDone={onRefresh} onNotice={onNotice} />
                  </div>
                </div>
              ) : (
                <div className="min-h-0 flex-1 overflow-hidden">
                  <SkillViewer
                    key={focused.hash}
                    hash={focused.hash}
                    skill={focused}
                    actions={
                      <SkillActions
                        skill={focused}
                        groups={groups}
                        onArchive={onArchive}
                        onGroupsChanged={onRefresh}
                        onNotice={onNotice}
                      />
                    }
                    onSaved={onSaved}
                  />
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-line px-4 py-2">
            <Collapsible open={showArchive} onOpenChange={setShowArchive}>
              <CollapsibleTrigger>
                <span className="flex items-center gap-2">
                  <Archive className="size-4 text-ink-mid" aria-hidden />
                  {showArchive ? "收起归档" : archived.length > 0 ? "归档区（" + String(archived.length) + "）" : "归档区"}
                </span>
              </CollapsibleTrigger>
              <CollapsiblePanel className="mt-2">
                <ArchivePanel archived={archived} onRestore={onRestore} />
              </CollapsiblePanel>
            </Collapsible>
          </div>
        </div>
      )}
      {confirm !== null && (
        <ConfirmDialog
          title={confirm.action === "enable" ? "全部启用" : "全部停用"}
          body={
            confirm.action === "enable"
              ? "将新增 " + String(confirm.add) + " 条链接到 " + (confirm.clientIds.length === 1 ? confirm.clientIds[0]! : String(confirm.clientIds.length) + " 个应用") +
                (confirm.conflicts > 0 ? "。" + String(confirm.conflicts) + " 处已被本地目录占用，不会覆盖。" : "。") +
                "磁盘会立刻改掉；正在运行的应用可能仍要新开对话。"
              : "将从 " + (confirm.clientIds.length === 1 ? confirm.clientIds[0]! : String(confirm.clientIds.length) + " 个应用") +
                " 摘掉 " + String(confirm.remove) + " 条受管链接。库存原件保留。"
          }
          confirmLabel={confirm.action === "enable" ? "启用" : "停用"}
          tone={confirm.action === "disable" ? "danger" : "default"}
          busy={bulkBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runConfirmedBulk()}
        />
      )}
    </div>
  );
}
