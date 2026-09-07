import { postSse } from "../../lib/sse.js";
import { fileResourceKey, loadResource, treeResourceKey } from "./async-resource.js";
import { hashesByClient, hashesForApply } from "./batch-links.js";
import type { AdoptResponse, AnalyzeResponse, ArchiveResponse, BackupsListResponse, BackupsPreviewResponse, ClientSkillStatesResponse, ClientsResponse, DoctorResponse, GroupsResponse, LinksApplyResponse, LinksBatchParams, LinksPreviewResponse, ResetResponse, ShareResponse, SkillFileEntry, SkillFileResponse, SkillRecord, SkillsResponse, SkillTreeResponse, StatsResponse } from "./types.js";

/** 拉取库存列表;HTTP 失败抛错(调用方转为离线态)。 */
export async function fetchCatalog(): Promise<{ storeRoot: string; skills: SkillRecord[] }> {
  const res = await fetch("/api/skills");
  if (!res.ok) throw new Error("GET /api/skills → " + res.status);
  const body = (await res.json()) as SkillsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return { storeRoot: body.storeRoot, skills: body.skills };
}

export async function createGroup(id: string, name: string, description = ""): Promise<void> {
  const res = await fetch("/api/groups", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, name, description }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function renameGroup(id: string, name: string): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id), { method: "DELETE" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function changeGroupMembers(id: string, hashes: string[], action: "add" | "remove"): Promise<void> {
  const res = await fetch("/api/groups/" + encodeURIComponent(id) + "/members", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hashes, action }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) throw new Error(body?.message ?? "HTTP " + res.status);
}

export async function fetchGroups(): Promise<GroupsResponse["groups"]> {
  const res = await fetch("/api/groups");
  if (!res.ok) throw new Error("GET /api/groups → " + res.status);
  const body = (await res.json()) as GroupsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.groups;
}

export async function fetchClientSkillStates(clientId: string): Promise<ClientSkillStatesResponse> {
  const res = await fetch("/api/clients/" + encodeURIComponent(clientId) + "/skill-states");
  if (!res.ok) throw new Error("GET client-skill-states → " + res.status);
  const body = (await res.json()) as ClientSkillStatesResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body;
}

export async function fetchClients(): Promise<ClientsResponse["clients"]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("GET /api/clients → " + res.status);
  const body = (await res.json()) as ClientsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.clients;
}

export async function fetchBackups(): Promise<BackupsListResponse> {
  const res = await fetch("/api/backups");
  const body = (await res.json().catch(() => null)) as BackupsListResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function previewReset(snapshotId?: string): Promise<BackupsPreviewResponse> {
  const res = await fetch("/api/backups/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(snapshotId === undefined ? {} : { snapshotId }),
  });
  const body = (await res.json().catch(() => null)) as BackupsPreviewResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function startReset(snapshotId: string, confirm: string): Promise<ResetResponse> {
  const res = await fetch("/api/reset", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ snapshotId, confirm }),
  });
  const body = (await res.json().catch(() => null)) as ResetResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function fetchDoctor(): Promise<DoctorResponse> {
  const res = await fetch("/api/doctor");
  const body = (await res.json().catch(() => null)) as DoctorResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch("/api/stats");
  if (!res.ok) throw new Error("GET /api/stats → " + res.status);
  const body = (await res.json()) as StatsResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body;
}

async function loadSkillTree(hash: string, signal: AbortSignal): Promise<SkillFileEntry[]> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/tree", { signal });
  if (!res.ok) throw new Error("GET skill-tree → " + res.status);
  const body = (await res.json()) as SkillTreeResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.entries;
}

export async function fetchSkillTree(hash: string, signal?: AbortSignal): Promise<SkillFileEntry[]> {
  return loadResource(treeResourceKey(hash), (s) => loadSkillTree(hash, s), signal);
}

/** 读取文件内容;二进制/大文件/穿越等降级由服务端信封说明。 */
async function loadSkillFile(hash: string, relPath: string, signal: AbortSignal): Promise<SkillFileResponse> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath), { signal });
  const body = (await res.json().catch(() => null)) as SkillFileResponse | { ok: false; code: string; message: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const msg = body !== null && "message" in body ? body.message : "HTTP " + res.status;
    throw new Error(msg);
  }
  return body;
}

export async function fetchSkillFile(hash: string, relPath: string, signal?: AbortSignal): Promise<SkillFileResponse> {
  return loadResource(fileResourceKey(hash, relPath), (s) => loadSkillFile(hash, relPath, s), signal);
}

/** 写操作只给动作注册表用;UI 按 id 取 execute,不要直接调这些函数。 */

/** 编辑写回:PUT { content };成功返回新哈希(记录已更新,不静默失真)。 */
export async function saveSkillFile(hash: string, relPath: string, content: string): Promise<string> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/file?path=" + encodeURIComponent(relPath), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; hash?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok || typeof body.hash !== "string") {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
  return body.hash;
}

/** 翻译代理:本地服务代发,密钥绝不出现在前端。失败抛可读 Error(原文不受影响)。 */
export async function shareSkill(target: string): Promise<ShareResponse> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const body = (await res.json().catch(() => null)) as ShareResponse | { ok: false; code?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const err = new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
    (err as { code?: string }).code = body !== null && "code" in body ? body.code : "github-push-failed";
    throw err;
  }
  return body;
}

export async function analyzeSkill(target: string): Promise<AnalyzeResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ target }),
  });
  const body = (await res.json().catch(() => null)) as AnalyzeResponse | { ok: false; code?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const err = new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
    (err as { code?: string }).code = body !== null && "code" in body ? body.code : "analyze-failed";
    throw err;
  }
  return body;
}

/** 译文留存目标(#208):服务端按 target 解析记录哈希落盘,绝不写库存原件。 */
export interface TranslateSaveTarget {
  target: string;
  path: string;
}

/** 流式翻译:onDelta 渐进回调累积全文;resolve 返回全文;error 事件抛可读 Error。带 save 时服务端成功后留盘。 */
export async function translateText(
  text: string,
  onDelta?: (full: string) => void,
  signal?: AbortSignal,
  save?: TranslateSaveTarget,
): Promise<string> {
  const body: { text: string; target?: string; path?: string } = { text };
  if (save !== undefined) {
    body.target = save.target;
    body.path = save.path;
  }
  let full = "";
  let failed: string | null = null;
  await postSse(
    "/api/translate",
    body,
    {
      delta: (d) => {
        full += (JSON.parse(d) as { text: string }).text;
        onDelta?.(full);
      },
      error: (d) => {
        failed = (JSON.parse(d) as { message: string }).message;
      },
    },
    signal,
  );
  if (failed !== null) throw new Error(failed);
  return full;
}

/** 读译文缓存(#208):命中返回全文,未命中/降级一律返回 null(调用方回退到重新翻译)。 */
export async function fetchSkillTranslation(hash: string, relPath: string): Promise<string | null> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/translation?path=" + encodeURIComponent(relPath)).catch(() => null);
  if (res === null || res.status === 404 || !res.ok) return null;
  const body = (await res.json().catch(() => null)) as { ok: boolean; translated?: string } | null;
  if (body === null || !body.ok || typeof body.translated !== "string") return null;
  return body.translated;
}

export async function fetchArchive(): Promise<ArchiveResponse["archived"]> {
  const res = await fetch("/api/archive");
  if (!res.ok) throw new Error("GET /api/archive → " + res.status);
  const body = (await res.json()) as ArchiveResponse | { ok: false; message: string };
  if (!body.ok) throw new Error(body.message);
  return body.archived;
}

/** 开关背后就是 enable/disable(语义与 CLI 完全一致:只挂/摘链接,库存原件不动)。 */
export async function restoreSkill(name: string): Promise<{ dirName: string; hash: string }> {
  const res = await fetch("/api/skills/" + encodeURIComponent(name) + "/restore", { method: "POST" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; dirName?: string; hash?: string; message?: string } | null;
  if (!res.ok || body === null || !body.ok || typeof body.dirName !== "string" || typeof body.hash !== "string") {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
  return { dirName: body.dirName, hash: body.hash };
}

export async function archiveSkill(hash: string): Promise<void> {
  const res = await fetch("/api/skills/" + encodeURIComponent(hash) + "/archive", { method: "POST" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body?.message ?? "HTTP " + res.status);
  }
}

export interface CreateResponse {
  ok: true;
  command: "new";
  verb: string;
  dirName: string;
  hash?: string;
  storeDir?: string;
}

export async function createSkill(dirName: string, description: string): Promise<CreateResponse> {
  const res = await fetch("/api/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dirName, description }),
  });
  const body = (await res.json().catch(() => null)) as CreateResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function adoptSource(source: string): Promise<AdoptResponse> {
  const res = await fetch("/api/adopt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const body = (await res.json().catch(() => null)) as AdoptResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function previewLinks(params: LinksBatchParams): Promise<LinksPreviewResponse> {
  const res = await fetch("/api/links/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as LinksPreviewResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

export async function applyLinks(params: LinksBatchParams): Promise<LinksApplyResponse> {
  const res = await fetch("/api/links/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = (await res.json().catch(() => null)) as LinksApplyResponse | { ok: false; message?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    throw new Error(body !== null && "message" in body ? (body.message ?? "HTTP " + res.status) : "HTTP " + res.status);
  }
  return body;
}

/**
 * 预览后只提交无冲突的 hash。多客户端时按落点各打一次 apply,
 * 避免笛卡尔积把「这边可挂、那边占用」整单打回。
 */
export async function applyCleanLinkBatch(params: LinksBatchParams): Promise<{
  created: string[];
  removed: string[];
  skipped: number;
}> {
  const preview = await previewLinks(params);
  if (params.clientIds.length === 1) {
    const { hashes, skipped } = hashesForApply(preview, params.action);
    if (hashes.length === 0) return { created: [], removed: [], skipped };
    const result = await applyLinks({ ...params, hashes });
    return { created: result.created, removed: result.removed, skipped };
  }
  const byClient = hashesByClient(preview, params.action);
  const created: string[] = [];
  const removed: string[] = [];
  for (const clientId of params.clientIds) {
    const hashes = byClient.get(clientId);
    if (hashes === undefined || hashes.length === 0) continue;
    const result = await applyLinks({ hashes, clientIds: [clientId], action: params.action });
    created.push(...result.created);
    removed.push(...result.removed);
  }
  return { created, removed, skipped: preview.conflictCount };
}

export async function setSkillEnabled(hash: string, clientId: string, enable: boolean): Promise<void> {
  const res = await fetch("/api/skills/" + hash + "/" + (enable ? "enable" : "disable"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  const body = (await res.json().catch(() => null)) as { ok: boolean; message?: string; code?: string } | null;
  if (!res.ok || body === null || !body.ok) {
    const msg = body !== null && body.message !== undefined ? body.message : "HTTP " + res.status;
    const err = new Error(msg);
    (err as { code?: string }).code = body?.code ?? "io-error";
    throw err;
  }
}
