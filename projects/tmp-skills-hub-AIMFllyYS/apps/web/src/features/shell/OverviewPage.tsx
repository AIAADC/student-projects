import { Blocks, Link2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ClientInfo, DoctorResponse, SkillRecord } from "../skills/types.js";
import type { ShellNav } from "./page.js";
import { coverageOf, recentSkills } from "./stats-model.js";

interface OverviewPageProps {
  skills: SkillRecord[];
  clients: ClientInfo[];
  doctor: DoctorResponse | null;
  snapshotCount: number;
  onGo: (target: ShellNav) => void;
}

interface IssueItem {
  text: string;
  go: ShellNav;
}

function MetricButton({
  title,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  icon: typeof Blocks;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-xl border border-line bg-white p-4 text-left motion-press",
        "hover:-translate-y-0.5 hover:bg-surface hover:shadow-[var(--shadow-lift)]",
        "motion-reduce:translate-y-0 motion-reduce:shadow-none",
      )}
    >
      <span className="absolute inset-x-4 top-0 h-px bg-line-strong/25" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        <Icon className="size-4 text-ink-faint" aria-hidden />
      </div>
      <p className="mt-2 font-mono text-3xl font-semibold tracking-tight text-ink-strong">{value}</p>
      <p className="mt-1 text-xs text-ink-mid">{hint}</p>
    </button>
  );
}

/** 一眼健康,不是第二份统计。 */
export function OverviewPage({ skills, clients, doctor, snapshotCount, onGo }: OverviewPageProps): React.JSX.Element {
  const cover = coverageOf(skills);
  const dangling = doctor?.danglingLinks.length ?? 0;
  const unlinked = skills.filter((s) => s.visibleIn.length === 0).length;
  const issues: IssueItem[] = [];
  if (doctor !== null && (!doctor.store.resolved || !doctor.store.reachable)) {
    issues.push({ text: "库存不可达", go: { settings: true } });
  }
  if (dangling > 0) {
    issues.push({ text: "悬空链接 " + String(dangling) + " 条", go: { page: "skills", tab: "apps" } });
  }
  if (unlinked > 0) {
    issues.push({
      text: String(unlinked) + " 个 skill 还没挂到任何应用，可在 Skills 管理里一键启用",
      go: { page: "skills", tab: "apps" },
    });
  }
  if (snapshotCount === 0) {
    issues.push({ text: "还没有备份快照", go: { settings: true } });
  }
  const recent = recentSkills(skills, 5);
  const empty = skills.length === 0;

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-strong">总览</h1>
        <p className="mt-1 text-sm text-ink-mid">本机技能库存的整体情况。</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <MetricButton
            title="库存"
            value={String(skills.length)}
            hint="个 skill"
            icon={Blocks}
            onClick={() => onGo({ page: "skills", tab: "content" })}
          />
          <MetricButton
            title="覆盖"
            value={cover.total === 0 ? "0" : String(cover.linked) + "/" + String(cover.total)}
            hint="至少挂到一个应用"
            icon={Link2}
            onClick={() => onGo({ page: "skills", tab: "apps" })}
          />
          <MetricButton
            title="应用"
            value={String(clients.length)}
            hint="已发现的 IDE / CLI"
            icon={Monitor}
            onClick={() => onGo({ page: "stats" })}
          />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          {empty ? (
            <Button type="button" onClick={() => onGo({ page: "skills", tab: "content" })}>
              去收录
            </Button>
          ) : (
            <>
              <Button type="button" onClick={() => onGo({ page: "skills", tab: "apps" })}>
                {unlinked > 0 ? "去一键启用" : "去管应用"}
              </Button>
              <Button type="button" variant="outline" onClick={() => onGo({ page: "skills", tab: "content" })}>
                去看内容
              </Button>
              <Button type="button" variant="outline" onClick={() => onGo({ settings: true })}>
                打开设置
              </Button>
            </>
          )}
        </div>
        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="text-base font-medium text-ink-strong">需要处理</h2>
            {issues.length === 0 ? (
              <p className="mt-2 text-sm text-ink-mid">没有需要立刻处理的事。</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {issues.map((item) => (
                  <li key={item.text}>
                    <button
                      type="button"
                      onClick={() => onGo(item.go)}
                      className="motion-row w-full rounded-xl border border-line bg-white px-4 py-3 text-left text-sm text-ink-mid hover:bg-surface hover:text-ink-strong"
                    >
                      {item.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="text-base font-medium text-ink-strong">近期收录</h2>
            {recent.length === 0 ? (
              <p className="mt-2 text-sm text-ink-mid">库存还是空的。</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {recent.map((s) => (
                  <li key={s.hash}>
                    <button
                      type="button"
                      onClick={() => onGo({ page: "skills", tab: "content", hash: s.hash })}
                      className="motion-row flex w-full items-center justify-between px-4 py-2 text-left hover:bg-surface"
                    >
                      <span className="truncate text-sm text-ink-strong">{s.dirName}</span>
                      <span className="shrink-0 text-xs text-ink-faint">
                        {s.visibleIn.length > 0 ? "已挂 " + String(s.visibleIn.length) + " 个应用" : "未挂到应用"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </ScrollArea>
  );
}
