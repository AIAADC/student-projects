export const SHELL_PREFS_KEY = "skills-hub.shell";
export const SIDEBAR_DEFAULT_PX = 224;
export const SIDEBAR_MIN_PX = 180;
export const SIDEBAR_MAX_PX = 360;
export const SIDEBAR_ICON_PX = 48;

export interface ShellPrefs {
  collapsed: boolean;
  width: number;
}

const FALLBACK: ShellPrefs = { collapsed: false, width: SIDEBAR_DEFAULT_PX };

function clampWidth(n: number): number {
  return Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, Math.round(n)));
}

/** 解析 localStorage 里的壳偏好；坏数据回落到默认宽、展开。 */
export function parseShellPrefs(raw: string | null): ShellPrefs {
  if (raw === null || raw === "") return FALLBACK;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return FALLBACK;
    const rec = parsed as { collapsed?: unknown; width?: unknown };
    const collapsed = rec.collapsed === true;
    const width = typeof rec.width === "number" && Number.isFinite(rec.width)
      ? clampWidth(rec.width)
      : SIDEBAR_DEFAULT_PX;
    return { collapsed, width };
  } catch {
    return FALLBACK;
  }
}

export function readShellPrefs(): ShellPrefs {
  if (typeof localStorage === "undefined") return FALLBACK;
  try {
    return parseShellPrefs(localStorage.getItem(SHELL_PREFS_KEY));
  } catch {
    return FALLBACK;
  }
}

export function writeShellPrefs(prefs: ShellPrefs): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      SHELL_PREFS_KEY,
      JSON.stringify({ collapsed: prefs.collapsed, width: clampWidth(prefs.width) }),
    );
  } catch {
    /* 隐私模式写不进也不挡交互 */
  }
}
