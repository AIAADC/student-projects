import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getAction } from "../actions/registry.js";
import { AnalyzeDialog } from "./AnalyzeDialog.js";
import { ShareDialog } from "./ShareDialog.js";
import type { GroupDef, SkillRecord } from "./types.js";

interface SkillActionsProps {
  skill: SkillRecord;
  groups: GroupDef[];
  onArchive: (hash: string) => void;
  onGroupsChanged: () => void;
  onNotice: (text: string) => void;
}

/** 内容页选中 skill 后的次级动作:分析 / 分享 / 归档 / 分组。 */
export function SkillActions({
  skill,
  groups,
  onArchive,
  onGroupsChanged,
  onNotice,
}: SkillActionsProps): React.JSX.Element {
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [askArchive, setAskArchive] = useState(false);
  const archive = getAction("archive");
  const add = getAction("add-to-group");
  const remove = getAction("remove-from-group");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
          更多
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => setAnalyzeOpen(true)}>{getAction("analyze").verb}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShareOpen(true)}>{getAction("share").verb}</DropdownMenuItem>
          {groups.map((g) => {
            const inGroup = g.memberHashes.includes(skill.hash);
            return (
              <DropdownMenuItem
                key={g.id}
                onClick={() => {
                  const run = inGroup ? remove : add;
                  void run.execute({ id: g.id, hashes: [skill.hash] })
                    .then(() => onGroupsChanged())
                    .catch((e: unknown) => onNotice(e instanceof Error ? e.message : String(e)));
                }}
              >
                {inGroup ? "移出 " : "挂到 "}{g.name}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuItem
            className="text-red-700 data-highlighted:text-red-700"
            onClick={() => setAskArchive(true)}
          >
            {archive.verb}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AnalyzeDialog open={analyzeOpen} target={skill.dirName} onOpenChange={setAnalyzeOpen} />
      <ShareDialog open={shareOpen} target={skill.dirName} onOpenChange={setShareOpen} />
      {askArchive && (
        <ConfirmDialog
          title={archive.verb + " " + skill.dirName}
          body="会从所有应用摘掉链接，并移入归档区。库存原件保留，可从归档区恢复。"
          confirmLabel={archive.verb}
          onCancel={() => setAskArchive(false)}
          onConfirm={() => {
            setAskArchive(false);
            onArchive(skill.hash);
          }}
        />
      )}
    </>
  );
}
