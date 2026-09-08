import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAction } from "../actions/registry.js";
import { isBuiltinGroup } from "./builtin-groups.js";
import type { GroupDef } from "./types.js";

interface GroupManagerProps {
  groups: GroupDef[];
  onChanged: () => void;
  onNotice: (text: string) => void;
}

/** 管理分组定义:增删改名,不删 skill。 */
export function GroupManager({ groups, onChanged, onNotice }: GroupManagerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const create = getAction("create-group");
  const rename = getAction("rename-group");
  const del = getAction("delete-group");

  return (
    <>
      <Button type="button" variant="outline" size="sm" data-testid="group-create-open" onClick={() => setOpen(true)}>
        管理分组
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogTitle>分组</DialogTitle>
          <DialogDescription>分组只是命名子集,删分组不会删 skill。</DialogDescription>
          <ul className="mt-3 space-y-2">
            {groups.length === 0 && <li className="text-sm text-ink-mid">暂无分组</li>}
            {groups.map((g) => (
              <li key={g.id} className="flex items-center gap-2">
                {renameId === g.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const name = renameValue.trim();
                      if (name === "") return;
                      void rename.execute({ id: g.id, name }).then(() => {
                        setRenameId(null);
                        onChanged();
                      }).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)));
                    }}
                  >
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
                    <Button type="submit" size="sm">{rename.verb}</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenameId(null)}>取消</Button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-strong">{g.name}</span>
                    <span className="font-mono text-xs text-ink-faint">{g.memberHashes.length}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid={"group-menu-" + g.id}
                      onClick={() => {
                        setRenameId(g.id);
                        setRenameValue(g.name);
                      }}
                    >
                      {rename.verb}
                    </Button>
                    {!isBuiltinGroup(g.id) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          void del.execute({ id: g.id }).then(() => onChanged()).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)));
                        }}
                      >
                        {del.verb}
                      </Button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-4 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = newId.trim();
              if (id === "") return;
              void create.execute({ id, name: newName.trim() === "" ? id : newName.trim() }).then(() => {
                setNewId("");
                setNewName("");
                onChanged();
              }).catch((err: unknown) => onNotice(err instanceof Error ? err.message : String(err)));
            }}
          >
            <Input data-testid="group-create-id" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="id（小写字母开头）" />
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="显示名（可空）" />
            <Button type="submit" size="sm" data-testid="group-create-submit" disabled={newId.trim() === ""}>
              {create.verb}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
