import type { ClientInfo, SkillRecord } from "../skills/types.js";

/** 人更常打开的应用排在同启用数里更前;不改发现规则。 */
const PREFERRED_CLIENT_IDS: readonly string[] = ["cursor", "codex", "claude", "agents"];

export function enabledCountForClient(skills: readonly SkillRecord[], clientId: string): number {
  return skills.filter((s) => s.visibleIn.includes(clientId)).length;
}

export function sortClientsForApps(
  clients: readonly ClientInfo[],
  skills: readonly SkillRecord[],
): ClientInfo[] {
  const preferredIndex = (id: string): number => {
    const i = PREFERRED_CLIENT_IDS.indexOf(id);
    return i === -1 ? PREFERRED_CLIENT_IDS.length : i;
  };
  return [...clients].sort((a, b) => {
    const byEnabled = enabledCountForClient(skills, b.clientId) - enabledCountForClient(skills, a.clientId);
    if (byEnabled !== 0) return byEnabled;
    const byPreferred = preferredIndex(a.clientId) - preferredIndex(b.clientId);
    if (byPreferred !== 0) return byPreferred;
    return a.clientId.localeCompare(b.clientId);
  });
}

export function appsCoverageHint(enabled: number, total: number): string {
  if (total === 0) return "库存还是空的。";
  if (enabled === 0) return "还没挂到这个应用。点全部启用。系统目录不在此列。";
  return "已启用 " + String(enabled) + " / " + String(total) + "。未启用是还没挂链接。系统目录不在此列。";
}

export type ClientIdGroup = { key: "cursor" | "claude" | "other"; label: string; ids: string[] };

/** 设置折叠卡：cursor / claude 各一组，其余进「其他」。不改发现规则。 */
export function groupClientIds(ids: readonly string[]): ClientIdGroup[] {
  const cursor: string[] = [];
  const claude: string[] = [];
  const other: string[] = [];
  for (const id of ids) {
    const lower = id.toLowerCase();
    if (lower.includes("cursor")) cursor.push(id);
    else if (lower.includes("claude")) claude.push(id);
    else other.push(id);
  }
  const groups: ClientIdGroup[] = [];
  if (cursor.length > 0) groups.push({ key: "cursor", label: "Cursor", ids: cursor });
  if (claude.length > 0) groups.push({ key: "claude", label: "Claude", ids: claude });
  if (other.length > 0) groups.push({ key: "other", label: "其他", ids: other });
  return groups;
}
