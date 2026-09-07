import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

/**
 * 客户端 skills 根目录发现:按目录形状扫描,不维护品牌名单。
 *
 * 规则(实现口径 docs/specs/store-and-paths-v0.md §4,调研底稿
 * docs/audits/client-skills-directories-2026-08-16.md):
 * 1. <home> 下每个直接子目录,凡存在 <home>/<client>/skills 即为一个 root
 * 2. 已知嵌套惯例(存在才算):.cursor/skills-cursor、.gemini/antigravity/skills、
 *    .codeium/windsurf/skills,以及 XDG 风格 config/<client>/skills
 *    (Devin CLI / OpenCode 的官方全局目录,见审计文档 §1.6/§1.9)
 * 3. 解析真实路径并去重(.codex/skills 与 .agents/skills 等可能互为 symlink)
 * 4. 排除:builtin_skills、插件/市场缓存、扩展目录、浏览器 profile、临时目录、
 *    本项目自己的目录(skills-hub 及带后缀变体)、以及调用方声明的库存根
 * 5. 绝不创建不存在的目录——本函数只读,找不到就返回空
 */
export interface ClientRoot {
  /** 客户端 id:直接子目录名(如 claude/codex/trae-cn),嵌套惯例用其所属 id */
  clientId: string;
  /** skills 根目录绝对路径(已解析真实路径) */
  skillsDir: string;
}

/** 已知嵌套惯例(存在才算)。前三条为规范 §4 原始约定,XDG 风格为通用扫描(见 audit §5)。 */
const NESTED_CONVENTIONS: ReadonlyArray<{ clientId: string; relDir: string }> = [
  { clientId: "cursor", relDir: ".cursor/skills-cursor" },
  { clientId: "gemini", relDir: ".gemini/antigravity/skills" },
  { clientId: "windsurf", relDir: ".codeium/windsurf/skills" },
];

/**
 * 排除清单:命中即跳过(不区分大小写,按路径段精确匹配)。
 * 这些目录归客户端所有,客户端更新时会被覆盖,不应视为用户技能资产
 * (规范 §4 排除项 + 审计文档 §4)。
 */
const EXCLUDED_SEGMENTS: readonly string[] = [
  // 内置技能目录
  "builtin_skills",
  // 插件与市场缓存
  "plugins",
  "cache",
  "caches",
  // 扩展目录
  "extensions",
  // 临时目录
  "tmp",
  "temp",
  // 浏览器 profile(精确匹配段名,避免 knowledge 之类含 "edge" 的误伤)
  "google-chrome",
  "chromium",
  "firefox",
  "msedge",
  "brave",
  "opera",
  "vivaldi",
  "safari",
];

/** 本项目自己的目录名前缀(去前导点后)。带后缀变体如 pre-bootstrap 时间戳也要排除。 */
const OWN_DIR_PREFIX = "skills-hub";

/** 客户端 id / 路径段是否为本项目目录(skills-hub 及带后缀变体)。大小写不敏感。 */
export function isOwnClientId(id: string): boolean {
  const n = id.replace(/^\.+/, "").toLowerCase();
  return n === OWN_DIR_PREFIX || n.startsWith(OWN_DIR_PREFIX + ".");
}

export interface DiscoverRootsOptions {
  /** 库存根:其自身及子目录永不作为客户端 root */
  storeRoot?: string;
}

function samePath(a: string, b: string): boolean {
  return path.relative(a, b) === "";
}

function isInside(inner: string, outer: string): boolean {
  const rel = path.relative(outer, inner);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * 库存根被当成客户端的两种形态:
 * - `<storeRoot>/skills` 本身(默认库存落在 home 下时,形状扫描会把它收成一个 root)
 * - 库存布局子树(backups/archive/tmp)里再出现 skills/
 * 当 --home 让 storeRoot 等于 home 时,home 下的 .claude 等客户端必须保留。
 */
function isStoreOwnedSkillsDir(skillsDir: string, storeRoot: string): boolean {
  if (samePath(path.dirname(skillsDir), storeRoot)) return true;
  for (const sub of ["skills", "backups", "archive", "tmp"]) {
    if (isInside(skillsDir, path.join(storeRoot, sub))) return true;
  }
  return false;
}

/**
 * skills 目录是否命中排除清单。
 * 只判定 home 之下的相对段:排除语义针对客户端目录名,不针对 home 自身位置
 * (否则沙箱/临时 home 会被 "tmp/temp" 段误杀)。段名去前导点后比较,大小写不敏感。
 * storeRoot 是额外保护:库存根本身及其子目录永不作为客户端,即使名字不像 skills-hub。
 */
export function isExcludedRoot(skillsDir: string, home: string, storeRoot?: string): boolean {
  if (storeRoot !== undefined && storeRoot !== "" && isStoreOwnedSkillsDir(skillsDir, storeRoot)) return true;
  const rel = path.relative(home, skillsDir);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return false; // 不在 home 下,无从判定
  const segments = rel.split(/[\\/]/).map((s) => s.replace(/^\.+/, "").toLowerCase());
  return segments.some((s) => EXCLUDED_SEGMENTS.includes(s) || isOwnClientId(s));
}

/**
 * 发现 home 下的全部客户端 skills 根目录(只读)。
 * - 直接子目录形状 + 嵌套惯例 + XDG 风格,全部解析真实路径并去重
 * - 输出按 clientId 排序,结果确定
 * - home 不存在/不可读时返回空数组,绝不创建任何目录
 */
export async function discoverClientRoots(home: string, opts?: DiscoverRootsOptions): Promise<ClientRoot[]> {
  return discoverClientRootsAt(home, opts);
}

/**
 * 在任意基准目录下发现客户端 skills 根(全局用 home,项目侧用 cwd;#22)。
 * 规则与 discoverClientRoots 相同,只读,绝不创建目录。
 */
export async function discoverClientRootsAt(base: string, opts?: DiscoverRootsOptions): Promise<ClientRoot[]> {
  const found = new Map<string, ClientRoot>();
  const declared = opts?.storeRoot;
  const storeRoot = declared !== undefined && declared !== ""
    ? await realpath(declared).catch(() => path.resolve(declared))
    : undefined;

  // 同名真实路径只保留第一个(确定性顺序下先到者胜,clientId 取先到者)
  const addRoot = async (clientId: string, skillsDir: string): Promise<void> => {
    if (isExcludedRoot(skillsDir, base, storeRoot)) return;
    const real = await realpath(skillsDir).catch(() => skillsDir);
    if (storeRoot !== undefined && isStoreOwnedSkillsDir(real, storeRoot)) return;
    if (!found.has(real)) {
      found.set(real, { clientId, skillsDir: real });
    }
  };

  // 1. 直接子目录形状:<base>/<client>/skills
  const entries = await readdir(base, { withFileTypes: true }).catch(() => []);
  const dirNames = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // 确定性
  for (const name of dirNames) {
    const skillsDir = path.join(base, name, "skills");
    if (await isDirectory(skillsDir)) {
      await addRoot(name.replace(/^\.+/, ""), skillsDir); // 去前导点:.claude → claude
    }
  }

  // 2. 已知嵌套惯例(存在才算)
  for (const c of NESTED_CONVENTIONS) {
    const skillsDir = path.join(base, c.relDir);
    if (await isDirectory(skillsDir)) {
      await addRoot(c.clientId, skillsDir);
    }
  }

  // 3. XDG 风格:<base>/.config/<client>/skills(Devin CLI / OpenCode 官方全局目录)
  const configDir = path.join(base, ".config");
  if (await isDirectory(configDir)) {
    const configEntries = await readdir(configDir, { withFileTypes: true }).catch(() => []);
    const configNames = configEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    for (const name of configNames) {
      const skillsDir = path.join(configDir, name, "skills");
      if (await isDirectory(skillsDir)) {
        await addRoot(name, skillsDir);
      }
    }
  }

  return [...found.values()].sort((a, b) => a.clientId.localeCompare(b.clientId));
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}
