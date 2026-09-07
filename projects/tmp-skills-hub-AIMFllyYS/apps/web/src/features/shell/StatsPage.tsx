import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  CHART_COLOR,
  CHART_INK,
  CHART_SERIES,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableHead, TableRow, TableTd, TableTh } from "@/components/ui/table";
import { SegmentedTabs, type SegmentedTabItem } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ClientInfo, SkillRecord, UsageCounters, UsageRankEntry } from "../skills/types.js";
import type { ShellNav, StatsTab } from "./page.js";
import {
  appDistribution,
  chartHeightPx,
  formatShare,
  sourceDistribution,
  STATS_TOP_N,
  topN,
  usageRows,
  usageSum,
} from "./stats-model.js";

const CHART_DURATION_MS = 600;

interface StatsPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  ranking: UsageRankEntry[];
  counters: Map<string, UsageCounters>;
  onGo: (target: ShellNav) => void;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function Empty({ onGo }: { onGo: (target: ShellNav) => void }): React.JSX.Element {
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-mid">还没有可展示的数据。</p>
      <Button type="button" variant="outline" onClick={() => onGo({ page: "overview" })}>
        回总览
      </Button>
    </div>
  );
}

function RankMark({ n }: { n: number }): React.JSX.Element {
  if (n > 3) return <span className="font-mono text-ink-faint">{String(n)}</span>;
  return (
    <span
      className={cn(
        "inline-flex size-5 items-center justify-center rounded-full bg-surface font-mono text-xs font-medium",
        n === 1 ? "text-ink-strong" : "text-ink-mid",
      )}
    >
      {String(n)}
    </span>
  );
}

function MicroBar({ part, all }: { part: number; all: number }): React.JSX.Element {
  const pct = all <= 0 ? 0 : Math.min(100, Math.round((part / all) * 100));
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full rounded-full bg-ink-mid/80 motion-safe:animate-bar-in"
          style={{ width: String(pct) + "%" }}
        />
      </div>
      <span>{formatShare(part, all)}</span>
    </div>
  );
}

function UsageChart({
  rows,
  onSelect,
}: {
  rows: { hash: string; name: string; total: number; show: number; enable: number }[];
  onSelect: (hash: string) => void;
}): React.JSX.Element {
  const animate = !reducedMotion();
  const open = (d: unknown): void => {
    if (typeof d !== "object" || d === null) return;
    const payload = (d as { payload?: { hash?: unknown } }).payload;
    if (payload !== undefined && typeof payload.hash === "string" && payload.hash !== "") {
      onSelect(payload.hash);
    }
  };
  return (
    <ChartContainer heightPx={chartHeightPx(rows.length)}>
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 36, top: 8, bottom: 8 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke={CHART_INK.line} />
        <XAxis
          type="number"
          tick={{ fill: CHART_INK.mid, fontSize: 12 }}
          axisLine={{ stroke: CHART_INK.line }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tick={{ fill: CHART_INK.strong, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip cursor={{ fill: CHART_INK.surface }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="show"
          name="查看"
          stackId="usage"
          fill={CHART_COLOR.show}
          radius={[4, 0, 0, 4]}
          isAnimationActive={animate}
          animationDuration={CHART_DURATION_MS}
          animationEasing="ease-out"
          onClick={open}
        />
        <Bar
          dataKey="enable"
          name="启用"
          stackId="usage"
          fill={CHART_COLOR.enable}
          radius={[0, 4, 4, 0]}
          isAnimationActive={animate}
          animationDuration={CHART_DURATION_MS}
          animationEasing="ease-out"
          onClick={open}
        >
          <LabelList dataKey="total" position="right" fill={CHART_INK.mid} fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function AppsChart({
  rows,
  onSelect,
}: {
  rows: { id: string; enabled: number; total: number; coverage: number; coveragePct: number; coverageLabel: string }[];
  onSelect: (id: string) => void;
}): React.JSX.Element {
  const animate = !reducedMotion();
  return (
    <ChartContainer heightPx={chartHeightPx(rows.length)}>
      <BarChart
        accessibilityLayer
        data={rows}
        layout="vertical"
        margin={{ left: 8, right: 48, top: 8, bottom: 8 }}
        barCategoryGap={8}
      >
        <CartesianGrid horizontal={false} stroke={CHART_INK.line} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: CHART_INK.mid, fontSize: 12 }}
          axisLine={{ stroke: CHART_INK.line }}
          tickLine={false}
          tickFormatter={(v: number) => String(v) + "%"}
        />
        <YAxis
          type="category"
          dataKey="id"
          width={128}
          tick={{ fill: CHART_INK.strong, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <ChartTooltip cursor={{ fill: CHART_INK.surface }} content={<ChartTooltipContent />} />
        <Bar
          dataKey="coveragePct"
          name="覆盖率 %"
          fill={CHART_COLOR.enable}
          radius={4}
          isAnimationActive={animate}
          animationDuration={CHART_DURATION_MS}
          animationEasing="ease-out"
          onClick={(d: unknown) => {
            if (typeof d !== "object" || d === null) return;
            const payload = (d as { payload?: { id?: unknown } }).payload;
            if (payload !== undefined && typeof payload.id === "string") onSelect(payload.id);
          }}
        >
          <LabelList dataKey="coverageLabel" position="right" fill={CHART_INK.mid} fontSize={12} />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function SourceChart({ rows }: { rows: { kind: string; count: number }[] }): React.JSX.Element {
  const animate = !reducedMotion();
  return (
    <ChartContainer heightPx={256}>
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent />} />
        <Pie
          data={rows}
          dataKey="count"
          nameKey="kind"
          cx="50%"
          cy="50%"
          innerRadius={48}
          outerRadius={80}
          isAnimationActive={animate}
          animationDuration={CHART_DURATION_MS}
          animationEasing="ease-out"
          label={(props) => {
            const name = "name" in props && typeof props.name === "string" ? props.name : "";
            const value = "value" in props ? String(props.value ?? "") : "";
            return name + " " + value;
          }}
        >
          {rows.map((row, i) => {
            const fill = CHART_SERIES[i % CHART_SERIES.length] ?? CHART_COLOR.show;
            return <Cell key={row.kind} fill={fill} />;
          })}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

/** 定量页:前 8 名粗柱 + 排行表。 */
export function StatsPage({ skills, clients, ranking, counters, onGo }: StatsPageProps): React.JSX.Element {
  const [tab, setTab] = useState<StatsTab>("overview");
  const usage = useMemo(() => usageRows(skills, ranking, counters), [skills, ranking, counters]);
  const apps = useMemo(() => appDistribution(skills, clients), [skills, clients]);
  const sources = useMemo(() => sourceDistribution(skills), [skills]);
  const usageHead = topN(usage, STATS_TOP_N);
  const appHead = topN(apps, STATS_TOP_N).map((r) => ({
    ...r,
    coveragePct: Math.round(r.coverage * 100),
    coverageLabel: String(r.enabled) + "/" + String(r.total),
  }));
  const allUsage = usageSum(usage);
  const noData = usage.length === 0 && apps.length === 0;
  const tabs = useMemo((): SegmentedTabItem<StatsTab>[] => {
    const items: SegmentedTabItem<StatsTab>[] = [
      { id: "overview", label: "总览", testId: "stats-tab-overview" },
      { id: "usage", label: "用量", testId: "stats-tab-usage" },
      { id: "apps", label: "应用分布", testId: "stats-tab-apps" },
    ];
    if (sources.length > 0) items.push({ id: "sources", label: "来源", testId: "stats-tab-sources" });
    return items;
  }, [sources.length]);

  const openSkill = (hash: string): void => {
    onGo({ page: "skills", tab: "content", hash });
  };
  const openApp = (id: string): void => {
    onGo({ page: "skills", tab: "apps", clientId: id });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-line px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">统计</h1>
            <p className="mt-1 text-sm text-ink-mid">本机用量与各应用的分布。</p>
          </div>
          <SegmentedTabs ariaLabel="统计页签" value={tab} onChange={setTab} items={tabs} />
        </div>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div key={tab} className="motion-enter space-y-6 p-6">
          {tab === "overview" && (
            noData ? <Empty onGo={onGo} /> : (
              <div className="grid gap-4 lg:grid-cols-2">
                {usageHead.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">用量前 {String(usageHead.length)} 名</h2>
                    <p className="mt-1 text-xs text-ink-mid">蓝 = 查看，青 = 启用。点击进入该 skill。</p>
                    <UsageChart rows={usageHead} onSelect={openSkill} />
                  </Card>
                )}
                {appHead.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">应用覆盖</h2>
                    <p className="mt-1 text-xs text-ink-mid">已启用 / 库存。点击打开该应用。</p>
                    <AppsChart rows={appHead} onSelect={openApp} />
                  </Card>
                )}
                {sources.length > 0 && (
                  <Card>
                    <h2 className="text-base font-medium text-ink-strong">来源</h2>
                    <p className="mt-1 text-xs text-ink-mid">有标记的收录来源。</p>
                    <SourceChart rows={sources} />
                    <ul className="mt-3 space-y-1 text-sm text-ink-mid">
                      {sources.map((s) => (
                        <li key={s.kind}>{s.kind} · {String(s.count)} 份</li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )
          )}
          {tab === "usage" && (
            usage.length === 0 ? <Empty onGo={onGo} /> : (
              <div className="space-y-6">
                <Card>
                  <h2 className="text-base font-medium text-ink-strong">用量前 {String(usageHead.length)} 名</h2>
                  <p className="mt-1 text-xs text-ink-mid">全集在下表，不把全部塞进一张图。</p>
                  <UsageChart rows={usageHead} onSelect={openSkill} />
                </Card>
                <div>
                  <h2 className="mb-2 text-base font-medium text-ink-strong">排行</h2>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableTh className="w-12">#</TableTh>
                        <TableTh>名称</TableTh>
                        <TableTh className="text-right">查看</TableTh>
                        <TableTh className="text-right">启用</TableTh>
                        <TableTh className="text-right">合计</TableTh>
                        <TableTh className="text-right">占比</TableTh>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {usage.map((row, i) => (
                        <TableRow
                          key={row.hash}
                          className="motion-row cursor-pointer hover:bg-surface"
                          onClick={() => openSkill(row.hash)}
                        >
                          <TableTd><RankMark n={i + 1} /></TableTd>
                          <TableTd className="font-medium text-ink-strong">{row.name}</TableTd>
                          <TableTd className="text-right">{String(row.show)}</TableTd>
                          <TableTd className="text-right">{String(row.enable)}</TableTd>
                          <TableTd className="text-right">{String(row.total)}</TableTd>
                          <TableTd className="text-right"><MicroBar part={row.total} all={allUsage} /></TableTd>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          )}
          {tab === "apps" && (
            apps.length === 0 ? <Empty onGo={onGo} /> : (
              <div className="space-y-6">
                <Card>
                  <h2 className="text-base font-medium text-ink-strong">覆盖前 {String(appHead.length)} 名</h2>
                  <AppsChart rows={appHead} onSelect={openApp} />
                </Card>
                <div>
                  <h2 className="mb-2 text-base font-medium text-ink-strong">应用</h2>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableTh className="w-12">#</TableTh>
                        <TableTh>应用</TableTh>
                        <TableTh className="text-right">已启用</TableTh>
                        <TableTh className="text-right">库存</TableTh>
                        <TableTh className="text-right">覆盖</TableTh>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {apps.map((row, i) => (
                        <TableRow
                          key={row.id}
                          className="motion-row cursor-pointer hover:bg-surface"
                          onClick={() => openApp(row.id)}
                        >
                          <TableTd><RankMark n={i + 1} /></TableTd>
                          <TableTd className="font-medium text-ink-strong">{row.id}</TableTd>
                          <TableTd className="text-right">{String(row.enabled)}</TableTd>
                          <TableTd className="text-right">{String(row.total)}</TableTd>
                          <TableTd className="text-right"><MicroBar part={row.enabled} all={row.total} /></TableTd>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          )}
          {tab === "sources" && (
            sources.length === 0 ? <Empty onGo={onGo} /> : (
              <Card>
                <h2 className="text-base font-medium text-ink-strong">来源</h2>
                <SourceChart rows={sources} />
                <ul className="mt-3 space-y-1 text-sm text-ink-mid">
                  {sources.map((s) => (
                    <li key={s.kind}>{s.kind} · {String(s.count)} 份</li>
                  ))}
                </ul>
              </Card>
            )
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
