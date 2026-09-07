import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePanelRef } from "react-resizable-panels";
import { toast } from "sonner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { AgentPage } from "./features/agent/AgentPage.js";
import { OverviewPage } from "./features/shell/OverviewPage.js";
import { SettingsDialog } from "./features/shell/SettingsDialog.js";
import { Sidebar } from "./features/shell/Sidebar.js";
import { SkillsPage } from "./features/shell/SkillsPage.js";
import { StatsPage } from "./features/shell/StatsPage.js";
import type { AppPage, ShellNav, SkillsTab } from "./features/shell/page.js";
import {
  readShellPrefs,
  SIDEBAR_ICON_PX,
  SIDEBAR_MAX_PX,
  SIDEBAR_MIN_PX,
  writeShellPrefs,
  type ShellPrefs,
} from "./features/shell/shell-prefs.js";
import { useCatalog } from "./features/skills/use-catalog.js";

export default function App() {
  const [prefs] = useState<ShellPrefs>(readShellPrefs);
  const [page, setPage] = useState<AppPage>("overview");
  const [skillsTab, setSkillsTab] = useState<SkillsTab>("apps");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(prefs.collapsed);
  const [sidebarWidth, setSidebarWidth] = useState(prefs.width);
  const [sidebarMotion, setSidebarMotion] = useState(false);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarPanelRef = usePanelRef();
  const widthRaf = useRef<number | null>(null);
  const motionTimer = useRef<number | null>(null);
  const sidebarMotionRef = useRef(false);
  const catalog = useCatalog({ loadClientStates: page === "skills" && skillsTab === "apps" });

  useEffect(() => {
    writeShellPrefs({ collapsed, width: sidebarWidth });
  }, [collapsed, sidebarWidth]);

  useEffect(() => {
    return () => {
      if (widthRaf.current !== null) cancelAnimationFrame(widthRaf.current);
      if (motionTimer.current !== null) window.clearTimeout(motionTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!sidebarDragging) return;
    const stop = (): void => setSidebarDragging(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [sidebarDragging]);

  const appliedCollapse = useRef(false);
  useEffect(() => {
    if (appliedCollapse.current) return;
    appliedCollapse.current = true;
    if (prefs.collapsed) sidebarPanelRef.current?.collapse();
  }, [prefs.collapsed, sidebarPanelRef]);

  const go = (target: ShellNav): void => {
    if (target.settings === true) {
      setSettingsOpen(true);
      return;
    }
    if (target.page !== undefined) setPage(target.page);
    if (target.tab !== undefined) setSkillsTab(target.tab);
    if (target.clientId !== undefined) catalog.setSelectedClientId(target.clientId);
    if (target.hash !== undefined) catalog.setFocusedHash(target.hash);
  };

  const armSidebarMotion = useCallback((): void => {
    sidebarMotionRef.current = true;
    flushSync(() => setSidebarMotion(true));
    if (motionTimer.current !== null) window.clearTimeout(motionTimer.current);
    motionTimer.current = window.setTimeout(() => {
      motionTimer.current = null;
      sidebarMotionRef.current = false;
      setSidebarMotion(false);
    }, 320);
  }, []);

  const toggleCollapsed = (): void => {
    const next = !collapsed;
    armSidebarMotion();
    setCollapsed(next);
    if (next) {
      sidebarPanelRef.current?.resize(SIDEBAR_ICON_PX);
      sidebarPanelRef.current?.collapse();
      return;
    }
    const width = Math.max(sidebarWidth, SIDEBAR_MIN_PX);
    sidebarPanelRef.current?.expand();
    sidebarPanelRef.current?.resize(width);
  };

  return (
    <div className="h-dvh overflow-hidden bg-white">
      <Toaster />
      <ResizablePanelGroup
        orientation="horizontal"
        className={cn("h-full w-full", sidebarMotion && "sidebar-motion", sidebarDragging && "sidebar-dragging")}
      >
        <ResizablePanel
          id="shell-nav"
          panelRef={sidebarPanelRef}
          collapsible
          collapsedSize={SIDEBAR_ICON_PX}
          defaultSize={prefs.collapsed ? SIDEBAR_ICON_PX : prefs.width}
          minSize={collapsed || sidebarMotion ? SIDEBAR_ICON_PX : SIDEBAR_MIN_PX}
          maxSize={SIDEBAR_MAX_PX}
          groupResizeBehavior="preserve-pixel-size"
          className="overflow-hidden"
          style={{ overflow: "hidden" }}
          onResize={(size) => {
            if (sidebarMotionRef.current) return;
            const px = Math.round(size.inPixels);
            const nowCollapsed = px <= SIDEBAR_ICON_PX + 8;
            setCollapsed(nowCollapsed);
            if (nowCollapsed) return;
            if (widthRaf.current !== null) cancelAnimationFrame(widthRaf.current);
            widthRaf.current = requestAnimationFrame(() => {
              widthRaf.current = null;
              setSidebarWidth(px);
            });
          }}
        >
          <Sidebar
            page={page}
            collapsed={collapsed}
            settingsOpen={settingsOpen}
            onPage={setPage}
            onSettings={() => setSettingsOpen(true)}
            onToggleCollapsed={toggleCollapsed}
          />
        </ResizablePanel>
        <ResizableHandle
          disabled={collapsed}
          className="w-1 bg-line motion-fill hover:bg-line-strong"
          onPointerDown={() => {
            setSidebarDragging(true);
            sidebarMotionRef.current = false;
            setSidebarMotion(false);
            if (motionTimer.current !== null) {
              window.clearTimeout(motionTimer.current);
              motionTimer.current = null;
            }
          }}
          onPointerUp={() => setSidebarDragging(false)}
        />
        <ResizablePanel id="shell-main" minSize="40%" className="min-w-0">
          <main className="flex h-full min-h-0 min-w-0 flex-col">
            {catalog.status === "offline" && (
              <p className="shrink-0 bg-amber-50 px-6 py-3 text-sm text-amber-800">
                未连接到本地数据服务。先运行一键启动,再刷新本页。
              </p>
            )}
            {catalog.status === "loading" && <PageSkeleton />}
            {catalog.status === "ready" && (
              <div key={page} className="motion-enter flex min-h-0 flex-1 flex-col">
                {page === "overview" && (
                  <OverviewPage
                    skills={catalog.skills}
                    clients={catalog.clients}
                    doctor={catalog.doctor}
                    snapshotCount={catalog.snapshotCount}
                    onGo={go}
                  />
                )}
                {page === "stats" && (
                  <StatsPage
                    skills={catalog.skills}
                    clients={catalog.clients}
                    ranking={catalog.ranking}
                    counters={catalog.usageByHash}
                    onGo={go}
                  />
                )}
                {page === "skills" && (
                  <SkillsPage
                    tab={skillsTab}
                    onTab={setSkillsTab}
                    skills={catalog.skills}
                    clients={catalog.clients}
                    groups={catalog.groups}
                    archived={catalog.archived}
                    focusedHash={catalog.focusedHash}
                    onFocus={catalog.setFocusedHash}
                    pendingHash={catalog.pendingHash}
                    clientStates={catalog.clientStates}
                    selectedClientId={catalog.selectedClientId}
                    onSelectClient={catalog.setSelectedClientId}
                    onToggle={catalog.toggle}
                    onSaved={catalog.markSaved}
                    onRefresh={catalog.refresh}
                    onRestore={catalog.restore}
                    onArchive={catalog.archive}
                    onNotice={(text) => toast(text)}
                  />
                )}
                {page === "agent" && <AgentPage />}
              </div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        storeRoot={catalog.storeRoot}
        clients={catalog.clients}
        latestSnapshotId={catalog.latestSnapshotId}
        onResetDone={catalog.reload}
      />
    </div>
  );
}
