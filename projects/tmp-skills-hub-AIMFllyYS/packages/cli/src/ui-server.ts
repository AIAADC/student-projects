import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  archiveSkill,
  restoreArchivedSkill,
  discoverClientRoots,
  listArchivedSkills,
  listBackupSnapshots,
  previewRestoreClientSkills,
  readLatestSnapshotId,
  readLinksLedger,
  readStoreIndex,
  readUsageStats,
  resolveStoreRoot,
  usageRanking,
  type StoreRootOptions,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { performAdopt, performVerify, POINTER_REL } from "./store-cmds.js";
import { resolveSkill } from "./resolve-skill.js";
import { collectDoctorReport } from "./doctor.js";
import { performAnalyze, type AnalyzeGenerate } from "./analyze.js";
import { performShare } from "./share.js";
import { createAgentUIStreamResponse, streamText, type LanguageModel } from "ai";
import { mapLlmError } from "./llm/errors.js";
import {
  createQiniuModel,
  notConfiguredMessage,
  qiniuApiKey,
  resolveModel,
  STREAM_IDLE_TIMEOUT_MS,
} from "./llm/provider.js";
import { readTranslation, writeTranslation } from "./translations.js";
import { createSkillsHubAgent, parseWritePolicy } from "./agent/agent.js";
import { AGENT_MODELS, DEFAULT_AGENT_MODEL, resolveAgentModel } from "./agent/models.js";
import { attachVisibleIn, clientDiscoverOpts, err, skillLookupErr, withStore, type UiRouteContext } from "./ui-http.js";
import { registerGroupRoutes } from "./ui-groups.js";
import { registerDraftRoutes } from "./ui-drafts.js";
import { registerContentRoutes } from "./ui-content.js";
import { registerLinkRoutes } from "./ui-links.js";

export const DEFAULT_UI_PORT = 4321;

/** 翻译代理(#38)常量:单次截断上限防滥用;流式下发,空闲超时由 STREAM_IDLE_TIMEOUT_MS 管。 */
export const MAX_TRANSLATE_CHARS = 200_000;

/** 翻译系统提示:保留代码块与 frontmatter 原文,只译说明性文字。 */
export const TRANSLATE_SYSTEM_PROMPT =
  "你是 skill 文档翻译器。把用户给的 Markdown 翻译成简体中文,规则:\n" +
  "- 代码块与行内代码、frontmatter(--- 之间的 YAML)、URL 一律保留原文,绝不翻译\n" +
  "- 只译说明性文字;术语首次出现可附英文原名\n" +
  "- 保持 Markdown 结构与标题层级不变\n" +
  "- 只输出译文,不要解释";

/**
 * HTTP 契约(v0,见 docs/specs/http-api-v0.md):面板数据源。
 * createUiApp 只做路由注册与注入;写操作的业务 if 在 perform*(分组/草稿/链接)或各 register* 模块。
 * 服务只绑 127.0.0.1;storeRoot/home 可注入(沙箱测试)。
 */

export interface UiAppOptions {
  /** 库存根;null = 未配置(端点返回 store-not-configured) */
  storeRoot?: string | null;
  /** home 解析基座(沙箱测试注入;缺省 resolveHome()) */
  home?: string;
  /** web 静态产物根(缺省 apps/web/dist;测试注入临时目录) */
  webRoot?: string;
  /** 翻译流式实现注入(测试替身隔离网络) */
  translateStream?: TranslateStreamFn;
  /** 分析生成替身(测试隔离真实网络) */
  analyzeGenerate?: AnalyzeGenerate;
  /** GitHub/skills.sh 拉取用的 fetch 替身(测试隔离真实网络) */
  fetchImpl?: typeof fetch;
  /** Agent / 翻译用的语言模型替身(测试隔离真实网络) */
  languageModel?: LanguageModel;
}

export type TranslateStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

export type TranslateStreamFn = (text: string, opts?: { signal?: AbortSignal }) => AsyncIterable<TranslateStreamEvent>;

async function* defaultTranslateStream(
  text: string,
  opts: { signal?: AbortSignal; model?: LanguageModel } = {},
): AsyncGenerator<TranslateStreamEvent> {
  if (opts.model === undefined && qiniuApiKey() === undefined) {
    yield { type: "error", code: "not-configured", message: notConfiguredMessage() };
    return;
  }
  try {
    const streamOpts: Parameters<typeof streamText>[0] = {
      model: opts.model ?? createQiniuModel(resolveModel()),
      system: TRANSLATE_SYSTEM_PROMPT,
      prompt: text,
      timeout: { chunkMs: STREAM_IDLE_TIMEOUT_MS },
    };
    if (opts.signal !== undefined) streamOpts.abortSignal = opts.signal;
    const result = streamText(streamOpts);
    for await (const delta of result.textStream) {
      yield { type: "text", delta };
    }
    yield { type: "done" };
  } catch (e) {
    const mapped = mapLlmError(e);
    yield { type: "error", code: mapped.code, message: mapped.message };
  }
}

/** 默认静态根:编译后位于 packages/cli/dist/,上三级到仓库根,再进 apps/web/dist。 */
function defaultWebRoot(): string {
  return fileURLToPath(new URL("../../../apps/web/dist", import.meta.url));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".map": "application/json",
};

/** 静态产物缺失时的可操作提示页(而不是裸 404)。 */
function notFoundPage(): string {
  return [
    "<!doctype html><html lang='zh'><meta charset='utf-8'><title>skill-hub ui</title>",
    "<body style='font-family:system-ui,sans-serif;max-width:36rem;margin:4rem auto;padding:0 1rem;color:#030712'>",
    "<h1 style='font-size:1.25rem'>面板尚未构建</h1>",
    "<p>本地数据服务已就绪,但静态面板产物不存在。先构建:</p>",
    "<p style='font-family:ui-monospace,monospace;font-size:.875rem;background:#f9fafb;padding:.75rem;border-radius:.5rem'>pnpm --filter @skills-hub/web build</p>",
    "<p>构建完成后刷新本页即可。API 端点不受影响:<a href='/api/health'>/api/health</a></p>",
    "</body></html>",
  ].join("");
}

export function createUiApp(opts: UiAppOptions = {}): Hono {
  const app = new Hono();
  const storeRoot = opts.storeRoot === undefined ? null : opts.storeRoot;
  const home = opts.home ?? resolveHome();
  const translateStream: TranslateStreamFn =
    opts.translateStream ??
    ((text, streamOpts) => {
      const pass: { signal?: AbortSignal; model?: LanguageModel } = {};
      if (streamOpts?.signal !== undefined) pass.signal = streamOpts.signal;
      if (opts.languageModel !== undefined) pass.model = opts.languageModel;
      return defaultTranslateStream(text, pass);
    });
  const analyzeGenerate = opts.analyzeGenerate;
  const fetchImpl = opts.fetchImpl;
  const webRoot = opts.webRoot ?? defaultWebRoot();
  const ctx: UiRouteContext = { storeRoot, home };

  registerGroupRoutes(app, ctx);
  registerDraftRoutes(app, ctx);
  registerContentRoutes(app, ctx);
  registerLinkRoutes(app, ctx);

  app.get("/api/health", (c) => c.json({ ok: true }));

  app.get("/api/skills", (c) =>
    withStore(ctx, c, "skills", async (root) => {
      const skills = attachVisibleIn(await readStoreIndex(root), await readLinksLedger(root));
      return c.json({ ok: true, command: "skills", storeRoot: root, total: skills.length, skills });
    }),
  );

  app.get("/api/skills/:hash", (c) =>
    withStore(ctx, c, "skill", async (root) => {
      const needle = c.req.param("hash");
      const skills = attachVisibleIn(await readStoreIndex(root), await readLinksLedger(root));
      const hit = resolveSkill(needle, skills);
      if (!hit.ok) return skillLookupErr(c, "skill", hit);
      return c.json({ ok: true, command: "skill", skill: hit.skill });
    }),
  );

  app.get("/api/stats", (c) =>
    withStore(ctx, c, "stats", async (root) => {
      const stats = await readUsageStats(root);
      return c.json({ ok: true, command: "stats", stats, ranking: usageRanking(stats) });
    }),
  );

  app.get("/api/verify", (c) =>
    withStore(ctx, c, "verify", async (root) => {
      const report = await performVerify(root);
      return c.json({ ok: true, command: "verify", ...report });
    }),
  );

  app.get("/api/doctor", (c) =>
    withStore(ctx, c, "doctor", async (root) => {
      const report = await collectDoctorReport(home, root);
      return c.json({ ok: true, command: "doctor", ...report });
    }),
  );

  app.get("/api/backups", (c) =>
    withStore(ctx, c, "backup", async (root) => {
      const latest = await readLatestSnapshotId(root);
      const snapshots = await listBackupSnapshots(root);
      return c.json({ ok: true, command: "backup", verb: "list", storeRoot: root, latest, snapshots });
    }),
  );

  app.get("/api/archive", (c) =>
    withStore(ctx, c, "archive", async (root) => {
      const archived = await listArchivedSkills(root);
      return c.json({ ok: true, command: "archive", verb: "list", archiveDir: path.join(root, "archive"), archived });
    }),
  );

  app.post("/api/translate", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { text?: unknown; target?: unknown; path?: unknown } | null;
    if (body === null || typeof body.text !== "string" || body.text === "") {
      return err(c, "translate", "bad-usage", "body 需要 { text: string }");
    }
    const sourceText = body.text;
    // 译文留存(#208):target+path 都带且能解析时,流式成功结束后 best-effort 落盘;绝不写 skills/ 原件
    let persist: { root: string; hash: string; rel: string } | null = null;
    if (storeRoot !== null && typeof body.target === "string" && body.target.trim() !== "" && typeof body.path === "string" && body.path.trim() !== "") {
      const hit = resolveSkill(body.target.trim(), await readStoreIndex(storeRoot).catch(() => []));
      if (hit.ok) persist = { root: storeRoot, hash: hit.skill.hash, rel: body.path.trim() };
    }
    return streamSSE(c, async (stream) => {
      let full = "";
      for await (const ev of translateStream(sourceText.slice(0, MAX_TRANSLATE_CHARS), { signal: c.req.raw.signal })) {
        if (ev.type === "text") {
          full += ev.delta;
          await stream.writeSSE({ event: "delta", data: JSON.stringify({ text: ev.delta }) });
        } else if (ev.type === "error") {
          await stream.writeSSE({ event: "error", data: JSON.stringify({ code: ev.code, message: ev.message }) });
          return;
        } else if (ev.type === "done") {
          if (persist !== null) await writeTranslation(persist.root, persist.hash, persist.rel, full);
          await stream.writeSSE({ event: "done", data: "{}" });
        }
      }
    });
  });

  // 译文缓存读取(#208):命中直接复用,不再调模型。键 = 记录哈希 + 相对路径。
  app.get("/api/skills/:hash/translation", (c) =>
    withStore(ctx, c, "skill-translation", async (root) => {
      const needle = c.req.param("hash") ?? "";
      const hit = resolveSkill(needle, await readStoreIndex(root));
      if (!hit.ok) return skillLookupErr(c, "skill-translation", hit);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-translation", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)");
      const res = await readTranslation(root, hit.skill.hash, rel);
      if (!res.ok) return err(c, "skill-translation", res.code, res.message, res.code === "translation-not-found" ? 404 : 400);
      return c.json({ ok: true, command: "skill-translation", hash: hit.skill.hash, path: rel, translated: res.content });
    }),
  );

  app.get("/api/agent/models", (c) =>
    c.json({ ok: true, command: "agent-models", defaultModel: DEFAULT_AGENT_MODEL, models: AGENT_MODELS }),
  );

  // Agent 对话(agent-v0.md):不包 withStore——库存未配置时仍可对话,工具返回可读文本。
  app.post("/api/agent/chat", async (c) => {
    if (opts.languageModel === undefined && qiniuApiKey() === undefined) {
      return err(c, "agent-chat", "not-configured", notConfiguredMessage());
    }
    const raw = (await c.req.json().catch(() => null)) as { messages?: unknown; model?: unknown; writePolicy?: unknown } | null;
    const messages = raw?.messages;
    if (!Array.isArray(messages)) return err(c, "agent-chat", "bad-usage", "body 需要 { messages: UIMessage[] }(不含 system)");
    if (messages.some((m) => typeof m === "object" && m !== null && (m as { role?: unknown }).role === "system")) {
      return err(c, "agent-chat", "bad-usage", "body 需要 { messages: UIMessage[] }(不含 system)");
    }
    const modelId = resolveAgentModel(raw?.model);
    const writePolicy = parseWritePolicy(raw?.writePolicy);
    const clients = (await discoverClientRoots(home, clientDiscoverOpts(storeRoot))).map((r) => r.clientId);
    const env: { home: string; storeRoot: string | null; fetchImpl?: typeof fetch; analyzeGenerate?: AnalyzeGenerate } = {
      home,
      storeRoot,
    };
    if (fetchImpl !== undefined) env.fetchImpl = fetchImpl;
    if (analyzeGenerate !== undefined) env.analyzeGenerate = analyzeGenerate;
    const agent = createSkillsHubAgent({
      model: opts.languageModel ?? createQiniuModel(modelId),
      env,
      clients,
      writePolicy,
    });
    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal: c.req.raw.signal,
    });
  });

  app.post("/api/analyze", (c) =>
    withStore(ctx, c, "analyze", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "analyze", "bad-usage", "body 需要 { target: string }");
      const analyzeOpts = analyzeGenerate !== undefined
        ? { generate: analyzeGenerate, allowLocalPath: false as const }
        : { allowLocalPath: false as const };
      const res = await performAnalyze(root, target, analyzeOpts);
      if (!res.ok) return err(c, "analyze", res.code, res.message);
      return c.json({ ok: true, command: "analyze", target: res.target, similar: res.similar, conflict: res.conflict });
    }),
  );

  app.post("/api/share", (c) =>
    withStore(ctx, c, "share", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { target?: unknown; repo?: unknown } | null;
      const target = typeof raw?.target === "string" ? raw.target.trim() : "";
      if (target === "") return err(c, "share", "bad-usage", "body 需要 { target: string }");
      const shareOpts: { dryRun: false; fetchImpl?: typeof fetch; repo?: string } = { dryRun: false };
      if (fetchImpl !== undefined) shareOpts.fetchImpl = fetchImpl;
      if (typeof raw?.repo === "string" && raw.repo.trim() !== "") shareOpts.repo = raw.repo.trim();
      const res = await performShare(root, target, shareOpts);
      if (!res.ok) return err(c, "share", res.code, res.message);
      return c.json({ ok: true, command: "share", dirName: res.dirName, url: res.url, idempotent: res.idempotent, dryRun: res.dryRun });
    }),
  );

  app.post("/api/backups/preview", (c) =>
    withStore(ctx, c, "backups-preview", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown } | null;
      const snapshotId = typeof raw?.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      const preview = snapshotId === undefined
        ? await previewRestoreClientSkills(root, home)
        : await previewRestoreClientSkills(root, home, snapshotId);
      if (!preview.ok) return err(c, "backups-preview", preview.code, preview.message);
      const pointerDir = path.dirname(path.join(home, POINTER_REL));
      const asideStore = root + ".pre-reinit";
      const pointerRel = path.relative(root, pointerDir);
      const pointerMovesWithStore =
        path.resolve(root) === path.resolve(home) ||
        pointerRel === "" ||
        (!pointerRel.startsWith("..") && !path.isAbsolute(pointerRel));
      return c.json({
        ok: true,
        command: "backups-preview",
        snapshotId: preview.snapshotId,
        dryRun: true,
        clients: preview.clients,
        skills: preview.skills,
        files: preview.files,
        links: preview.links,
        wouldRestore: preview.wouldRestore,
        skippedOwnDirs: preview.skippedOwnDirs,
        asideStore,
        asidePointer: pointerMovesWithStore ? asideStore : pointerDir + ".pre-reinit",
      });
    }),
  );

  app.post("/api/reset", (c) =>
    withStore(ctx, c, "reset", async () => {
      const raw = (await c.req.json().catch(() => null)) as { snapshotId?: unknown; confirm?: unknown } | null;
      if (raw?.confirm !== "reset") return err(c, "reset", "bad-usage", "body 需要 { confirm: \"reset\" }");
      const snapshotId = typeof raw.snapshotId === "string" && raw.snapshotId.trim() !== "" ? raw.snapshotId.trim() : undefined;
      // 动态 import,避免与 reset-cmds → ui-server 形成静态环。
      const { performReset } = await import("./reset-cmds.js");
      const result = await performReset(snapshotId === undefined ? { home } : { home, snapshotId });
      if (!result.ok) return err(c, "reset", result.code, result.message);
      return c.json({
        ok: true,
        command: "reset",
        storeRoot: result.storeRoot,
        snapshotId: result.snapshotId,
        asideStore: result.asideStore,
        asidePointer: result.asidePointer,
        adopted: result.adopted,
      });
    }),
  );

  app.get("/api/clients", (c) =>
    discoverClientRoots(home, clientDiscoverOpts(storeRoot)).then((roots) =>
      c.json({ ok: true, command: "clients", clients: roots.map((r) => ({ clientId: r.clientId, skillsDir: r.skillsDir })) }),
    ),
  );

  app.post("/api/adopt", (c) =>
    withStore(ctx, c, "adopt", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { source?: unknown } | null;
      const source = typeof raw?.source === "string" ? raw.source.trim() : "";
      if (source === "") return err(c, "adopt", "bad-usage", "body 需要 { source: string }");
      const report = await performAdopt(root, [source], fetchImpl !== undefined ? { fetchImpl } : {});
      if (report.fetchFailed && report.outcomes.length === 0) {
        return err(c, "adopt", "github-fetch-failed", report.fetchMessage ?? "拉取失败");
      }
      return c.json({
        ok: true,
        command: "adopt",
        dryRun: false,
        storeRoot: root,
        adopted: report.adopted,
        duplicates: report.duplicates,
        conflicts: report.conflicts,
        invalid: report.invalid,
        fetchFailed: report.fetchFailed,
        outcomes: report.outcomes,
      });
    }),
  );

  app.post("/api/skills/:hash/archive", (c) =>
    withStore(ctx, c, "archive", async (root) => {
      const needle = c.req.param("hash");
      const hit = resolveSkill(needle, await readStoreIndex(root));
      if (!hit.ok) return skillLookupErr(c, "archive", hit);
      const dirName = hit.skill.dirName;
      const res = await archiveSkill(root, dirName);
      if (!res.ok) return err(c, "archive", res.code, res.message, 409);
      return c.json({ ok: true, command: "archive", dirName, archiveFile: res.archiveFile, sizeBytes: res.sizeBytes, removedLinks: res.removedLinks });
    }),
  );

  app.post("/api/skills/:hash/restore", (c) =>
    withStore(ctx, c, "restore", async (root) => {
      const needle = c.req.param("hash") ?? "";
      const res = await restoreArchivedSkill(root, needle);
      if (!res.ok) return err(c, "restore", res.code, res.message);
      return c.json({ ok: true, command: "restore", dirName: res.dirName, hash: res.hash, archiveFile: res.archiveFile });
    }),
  );

  const serveFile = async (c: Context, rel: string): Promise<Response> => {
    const relPath = rel === "/" ? "index.html" : rel;
    const safe = path.resolve(webRoot, "./" + relPath);
    if (safe !== webRoot && !safe.startsWith(webRoot + path.sep)) return c.text("Not found", 404);
    const file = await readFile(safe).catch(() => null);
    if (file === null) return c.html(notFoundPage(), 200);
    const ext = path.extname(safe).toLowerCase();
    return new Response(file, { headers: { "content-type": MIME[ext] ?? "application/octet-stream" } });
  };

  app.get("/", (c) => serveFile(c, "index.html"));
  app.get("/assets/*", (c) => serveFile(c, c.req.path));
  app.get("*", (c) => {
    if (c.req.path.startsWith("/api/")) return err(c, "unknown", "not-found", "未知 API: " + c.req.path);
    return serveFile(c, "index.html");
  });

  return app;
}

/** 启动参数具名,避免把 storeRoot 按位置误传成 home(见 #95)。 */
export interface StartUiServerOptions {
  port?: number;
  /** 客户端发现的 home 基座,不是库存根 */
  home?: string;
}

/**
 * 面板库存定位:home 只作指针基座,不当 storeRoot。
 * `resolveStoreRoot` 的 cliHome 会直通成库存根;bootstrap / `ui --home` 传入的是用户目录,
 * 库存与 home 分离时(本机默认形态)会把主目录当成空库存。
 */
export async function resolveUiStoreRoot(home: string): Promise<string | null> {
  const storeOpts: StoreRootOptions = { pointerFilePath: path.join(home, POINTER_REL) };
  const envHome = process.env.SKILLS_HUB_HOME;
  if (envHome !== undefined && envHome !== "") storeOpts.envHome = envHome;
  const resolved = await resolveStoreRoot(storeOpts);
  return resolved.ok ? resolved.storeRoot : null;
}

export async function startUiServer(opts: StartUiServerOptions = {}): Promise<void> {
  const port = opts.port ?? DEFAULT_UI_PORT;
  const h = opts.home ?? resolveHome();
  const storeRoot = await resolveUiStoreRoot(h);
  serve({ fetch: createUiApp({ storeRoot, home: h }).fetch, port, hostname: "127.0.0.1" }, (info) => {
    console.log("skill-hub ui: http://127.0.0.1:" + info.port + "/api/skills" + (storeRoot === null ? " (库存未配置)" : ""));
  });
}
