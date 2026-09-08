import type { Context } from "hono";
import {
  discoverClientRoots,
  discoverClientRootsAt,
} from "@skills-hub/core";
import { type ResolveSkillFailure } from "./resolve-skill.js";

export { attachVisibleIn } from "@skills-hub/core";

/**
 * 本地服务路由共用件:信封错误、库存守卫、客户端解析。
 * 业务 if 不放这里——分组/草稿/链接走各自的 perform*。
 */

export interface UiRouteContext {
  storeRoot: string | null;
  home: string;
}

export type ApiErrorStatus = 400 | 404 | 409 | 422 | 500 | 502 | 503;

/** docs/specs/http-api-v0.md §4 */
const STATUS_BY_CODE: Record<string, ApiErrorStatus> = {
  "bad-usage": 400,
  outside: 400,
  "draft-incomplete": 400,
  "not-found": 404,
  "group-not-found": 404,
  "draft-not-found": 404,
  "link-failed": 409,
  "group-exists": 409,
  "draft-exists": 409,
  "remote-conflict": 409,
  "verify-failed": 409,
  "restore-failed": 409,
  conflict: 409,
  binary: 422,
  "too-large": 422,
  "io-error": 500,
  "github-fetch-failed": 502,
  "analyze-failed": 502,
  "github-push-failed": 502,
  "store-not-configured": 503,
  "not-configured": 503,
  "auth-required": 503,
};

export function httpStatus(code: string): ApiErrorStatus {
  return STATUS_BY_CODE[code] ?? 500;
}

export function err(c: Context, command: string, code: string, message: string, status?: ApiErrorStatus): Response {
  return c.json({ ok: false, command, code, message }, status ?? httpStatus(code));
}

export function skillLookupErr(c: Context, command: string, hit: ResolveSkillFailure): Response {
  return hit.code === "ambiguous" ? err(c, command, "bad-usage", hit.message) : err(c, command, "not-found", hit.message);
}

export function withStore(
  ctx: UiRouteContext,
  c: Context,
  command: string,
  fn: (root: string) => Promise<Response>,
): Promise<Response> {
  return ctx.storeRoot === null
    ? Promise.resolve(err(c, command, "store-not-configured", "库存未配置。先运行 skills-hub init --home <path> --yes。"))
    : fn(ctx.storeRoot);
}



/** 客户端解析:按注入的 home(沙箱)或真实 home。找不到返回 null。 */
export async function resolveClientSkillsDirAt(
  home: string,
  clientId: string,
  scope: "global" | "project",
  storeRoot?: string | null,
): Promise<{ clientId: string; skillsDir: string } | null> {
  const base = scope === "project" ? process.cwd() : home;
  const opts = storeRoot !== undefined && storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined;
  const roots = scope === "project" ? await discoverClientRootsAt(base, opts) : await discoverClientRoots(home, opts);
  const root = roots.find((r) => r.clientId === clientId);
  return root === undefined ? null : { clientId: root.clientId, skillsDir: root.skillsDir };
}

export function clientDiscoverOpts(storeRoot: string | null): { storeRoot: string } | undefined {
  return storeRoot !== null && storeRoot !== "" ? { storeRoot } : undefined;
}
