import { BarChart3, Blocks, Bot, LayoutDashboard, PanelLeft, PanelLeftClose, Settings } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { AppPage } from "./page.js";
import { SIDEBAR_ICON_PX } from "./shell-prefs.js";

const NAV: { id: AppPage; label: string; testId: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "总览", testId: "nav-overview", icon: LayoutDashboard },
  { id: "stats", label: "统计", testId: "nav-stats", icon: BarChart3 },
  { id: "skills", label: "Skills 管理", testId: "nav-skills", icon: Blocks },
  { id: "agent", label: "Agent", testId: "nav-agent", icon: Bot },
];

/** 图标列固定 48px；文案在第二列。收起只裁切第二列，图标中心始终在 24px。 */
const RAIL_GRID: CSSProperties = {
  display: "grid",
  gridTemplateColumns: `${SIDEBAR_ICON_PX}px minmax(0, 1fr)`,
};

interface SidebarProps {
  page: AppPage;
  collapsed: boolean;
  settingsOpen: boolean;
  onPage: (page: AppPage) => void;
  onSettings: () => void;
  onToggleCollapsed: () => void;
}

function NavButton({
  label,
  active,
  testId,
  collapsed,
  icon: Icon,
  onClick,
}: {
  label: string;
  active: boolean;
  testId: string;
  collapsed: boolean;
  icon: typeof LayoutDashboard;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <Tooltip label={label} side="right" disabled={!collapsed}>
      <Button
        type="button"
        data-testid={testId}
        variant="ghost"
        aria-current={active ? "page" : undefined}
        aria-label={label}
        onClick={onClick}
        style={RAIL_GRID}
        className={cn(
          "h-9 w-full min-w-0 justify-stretch gap-0 rounded-none p-0",
          active && "bg-surface text-ink-strong",
        )}
      >
        <span className="flex items-center justify-center">
          <Icon className="size-4 text-ink-mid" aria-hidden />
        </span>
        <span className="sidebar-copy pr-3 text-left text-sm">{label}</span>
      </Button>
    </Tooltip>
  );
}

/** 左侧栏：CSS grid 图标列 + 文案列。展开/收起同一套格子，不换尺寸、不加垫层。 */
export function Sidebar({
  page,
  collapsed,
  settingsOpen,
  onPage,
  onSettings,
  onToggleCollapsed,
}: SidebarProps): React.JSX.Element {
  return (
    <aside
      data-testid="shell-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
    >
      <div className="h-12 w-full shrink-0 items-stretch" style={RAIL_GRID}>
        <Tooltip label={collapsed ? "展开侧栏" : "收起侧栏"} side="right">
          <Button
            type="button"
            variant="ghost"
            aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
            data-testid="nav-collapse"
            onClick={onToggleCollapsed}
            className="h-full w-full justify-center gap-0 rounded-none p-0"
          >
            {collapsed
              ? <PanelLeft className="size-4 text-ink-mid" aria-hidden />
              : <PanelLeftClose className="size-4 text-ink-mid" aria-hidden />}
          </Button>
        </Tooltip>
        <div className="sidebar-copy flex min-w-0 flex-col justify-center pr-3">
          <p data-testid="sidebar-brand" className="text-sm font-medium text-ink-strong">skill-hub</p>
          <p data-testid="sidebar-tagline" className="mt-0.5 text-xs text-ink-faint">本机技能管理</p>
        </div>
      </div>
      <Separator />
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1" aria-label="板块">
        {NAV.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            testId={item.testId}
            collapsed={collapsed}
            icon={item.icon}
            active={page === item.id}
            onClick={() => onPage(item.id)}
          />
        ))}
      </nav>
      <Separator />
      <div className="shrink-0 py-1">
        <NavButton
          label="设置"
          testId="nav-settings"
          collapsed={collapsed}
          icon={Settings}
          active={settingsOpen}
          onClick={onSettings}
        />
      </div>
    </aside>
  );
}
