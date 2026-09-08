import { getAction } from "../actions/registry.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBytes } from "./skill-tree.js";
import type { ArchivedSkill } from "./types.js";

/** 归档区:列出已归档内容与绝对路径(软删除铁律的可见部分)。没有真删除按钮。 */
export function ArchivePanel({
  archived,
  onRestore,
}: {
  archived: ArchivedSkill[];
  onRestore: (name: string) => void;
}): React.JSX.Element {
  if (archived.length === 0) {
    return <p className="text-sm text-ink-mid">归档区是空的。归档 = 软删除:本工具不提供真删除。</p>;
  }
  return (
    <ul className="space-y-3">
      {archived.map((a) => (
        <li key={a.file}>
          <Card>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-medium text-ink-strong">{a.name}</h2>
              <Badge>{formatBytes(a.sizeBytes)}</Badge>
            </div>
            <p className="mt-1 break-all font-mono text-xs text-ink-faint">{a.file}</p>
            <p className="mt-1 text-xs text-ink-mid">
              归档于 {new Date(a.archivedAt).toLocaleString()} · 彻底清除请自行处理上述文件(本工具不提供删除按钮)
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onRestore(a.name)}>
              {getAction("restore").verb}到活跃区
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
