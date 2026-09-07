import path from "node:path";
import type { Context, Hono } from "hono";
import {
  classifyClientLink,
  discoverClientRoots,
  readLinksLedger,
  readStoreIndex,
  type ClientLinkState,
} from "@skills-hub/core";
import { resolveSkill, type ResolveSkillFailure } from "./resolve-skill.js";
import {
  applyLinkBatch,
  performLinkChange,
  previewLinkChange,
  type LinkChangeRequest,
  type LinkConflictItem,
  type LinkDiffItem,
} from "./link-actions.js";
import {
  clientDiscoverOpts,
  err,
  resolveClientSkillsDirAt,
  skillLookupErr,
  withStore,
  type UiRouteContext,
} from "./ui-http.js";

interface LinkBody {
  clientId: string;
  scope: "global" | "project";
}

interface LinksBatchBody {
  hashes: string[];
  clientIds: string[];
  action: "enable" | "disable";
  scope: "global" | "project";
}

const parseLinkBody = async (c: Context): Promise<LinkBody | null> => {
  const body = await c.req.json().catch(() => null);
  const clientId = typeof body?.clientId === "string" && body.clientId.trim() !== "" ? body.clientId : null;
  if (clientId === null) return null;
  return { clientId, scope: body?.scope === "project" ? "project" : "global" };
};

const parseLinksBatch = async (c: Context): Promise<LinksBatchBody | { error: string }> => {
  const raw = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (raw === null) return { error: "body 需要 JSON { hashes, clientIds, action }" };
  const hashes = Array.isArray(raw.hashes) ? raw.hashes.filter((h): h is string => typeof h === "string" && h.trim() !== "") : [];
  const clientIds = Array.isArray(raw.clientIds) ? raw.clientIds.filter((id): id is string => typeof id === "string" && id.trim() !== "") : [];
  const action = raw.action === "disable" ? "disable" : raw.action === "enable" ? "enable" : null;
  if (hashes.length === 0 || clientIds.length === 0 || action === null) {
    return { error: "body 需要非空 hashes[]、clientIds[] 与 action: enable|disable" };
  }
  return { hashes, clientIds, action, scope: raw.scope === "project" ? "project" : "global" };
};

export function registerLinkRoutes(app: Hono, ctx: UiRouteContext): void {
  const resolveLinkTarget = async (
    root: string,
    needle: string,
    body: LinkBody,
  ): Promise<
    | { ok: true; dirName: string; clientId: string; scope: "global" | "project"; skillsDir: string }
    | { ok: false; kind: "client" }
    | ResolveSkillFailure
  > => {
    const client = await resolveClientSkillsDirAt(ctx.home, body.clientId, body.scope, ctx.storeRoot);
    if (client === null) return { ok: false, kind: "client" };
    const hit = resolveSkill(needle, await readStoreIndex(root));
    if (!hit.ok) return hit;
    return { ok: true, dirName: hit.skill.dirName, clientId: client.clientId, scope: body.scope, skillsDir: client.skillsDir };
  };

  const linkEndpoint = (action: "enable" | "disable") => (c: Context) =>
    withStore(ctx, c, action, async (root) => {
      const body = await parseLinkBody(c);
      if (body === null) return err(c, action, "bad-usage", "缺少 clientId(JSON body 需 { clientId: string, scope?: string })。");
      const target = await resolveLinkTarget(root, c.req.param("hash") ?? "", body);
      if (!target.ok) {
        if ("kind" in target) return err(c, action, "not-found", "未找到客户端或 skill: " + c.req.param("hash"));
        return skillLookupErr(c, action, target);
      }
      const result = await performLinkChange(
        { storeRoot: root, clientId: target.clientId, scope: target.scope, skillsDir: target.skillsDir, dirNames: [target.dirName] },
        action,
      );
      if (!result.ok) return err(c, action, result.code, result.message);
      return c.json({
        ok: true,
        command: action,
        clientId: target.clientId,
        scope: target.scope,
        targetDir: target.skillsDir,
        created: result.created,
        removed: result.removed,
      });
    });

  const resolveBatchRequests = async (
    root: string,
    body: LinksBatchBody,
  ): Promise<
    | { ok: true; action: "enable" | "disable"; items: LinkChangeRequest[] }
    | { ok: false; code: "not-found" | "bad-usage"; message: string }
  > => {
    const skills = await readStoreIndex(root);
    const dirNames: string[] = [];
    for (const needle of body.hashes) {
      const hit = resolveSkill(needle, skills);
      if (!hit.ok) {
        return { ok: false, code: hit.code === "ambiguous" ? "bad-usage" : "not-found", message: hit.message };
      }
      if (!dirNames.includes(hit.skill.dirName)) dirNames.push(hit.skill.dirName);
    }
    const items: LinkChangeRequest[] = [];
    for (const clientId of body.clientIds) {
      const client = await resolveClientSkillsDirAt(ctx.home, clientId, body.scope, ctx.storeRoot);
      if (client === null) return { ok: false, code: "not-found", message: "未找到客户端: " + clientId };
      items.push({ storeRoot: root, clientId: client.clientId, scope: body.scope, skillsDir: client.skillsDir, dirNames });
    }
    return { ok: true, action: body.action, items };
  };

  app.get("/api/skills/:hash/links", (c) =>
    withStore(ctx, c, "skill-links", async (root) => {
      const needle = c.req.param("hash");
      const skills = await readStoreIndex(root);
      const hit = resolveSkill(needle, skills);
      if (!hit.ok) return skillLookupErr(c, "skill-links", hit);
      const ledger = await readLinksLedger(root);
      const roots = await discoverClientRoots(ctx.home, clientDiscoverOpts(ctx.storeRoot));
      const links = [];
      for (const r of roots) {
        const inLedger = ledger.some((e) => e.clientId === r.clientId && e.entryName === hit.skill.dirName);
        const status = await classifyClientLink(path.join(r.skillsDir, hit.skill.dirName), inLedger);
        links.push({ clientId: r.clientId, state: status.state, detail: status.detail });
      }
      return c.json({ ok: true, command: "skill-links", hash: hit.skill.hash, links });
    }),
  );

  app.get("/api/clients/:clientId/skill-states", (c) =>
    withStore(ctx, c, "client-skill-states", async (root) => {
      const clientId = c.req.param("clientId");
      const roots = await discoverClientRoots(ctx.home, clientDiscoverOpts(ctx.storeRoot));
      const found = roots.find((r) => r.clientId === clientId);
      if (found === undefined) return err(c, "client-skill-states", "not-found", "未找到客户端: " + clientId);
      const skills = await readStoreIndex(root);
      const ledger = await readLinksLedger(root);
      const rows: { hash: string; state: ClientLinkState; detail: string }[] = [];
      for (const s of skills) {
        const inLedger = ledger.some((e) => e.clientId === clientId && e.entryName === s.dirName);
        const status = await classifyClientLink(path.join(found.skillsDir, s.dirName), inLedger);
        rows.push({ hash: s.hash, state: status.state, detail: status.detail });
      }
      const enabled = rows.filter((r) => r.state === "managed").length;
      return c.json({
        ok: true,
        command: "client-skill-states",
        clientId,
        skillsDir: found.skillsDir,
        enabled,
        total: skills.length,
        rows,
      });
    }),
  );

  app.post("/api/skills/:hash/enable", linkEndpoint("enable"));
  app.post("/api/skills/:hash/disable", linkEndpoint("disable"));

  app.post("/api/links/preview", (c) =>
    withStore(ctx, c, "links-preview", async (root) => {
      const parsed = await parseLinksBatch(c);
      if ("error" in parsed) return err(c, "links-preview", "bad-usage", parsed.error);
      const resolved = await resolveBatchRequests(root, parsed);
      if (!resolved.ok) return err(c, "links-preview", resolved.code, resolved.message);
      const wouldCreate: LinkDiffItem[] = [];
      const wouldRemove: LinkDiffItem[] = [];
      const conflicts: LinkConflictItem[] = [];
      for (const item of resolved.items) {
        const preview = await previewLinkChange(item, resolved.action);
        wouldCreate.push(...preview.wouldCreate);
        wouldRemove.push(...preview.wouldRemove);
        conflicts.push(...preview.conflicts);
      }
      return c.json({
        ok: true,
        command: "links-preview",
        action: resolved.action,
        add: wouldCreate.length,
        remove: wouldRemove.length,
        conflictCount: conflicts.length,
        wouldCreate,
        wouldRemove,
        conflicts,
      });
    }),
  );

  app.post("/api/links/apply", (c) =>
    withStore(ctx, c, "links-apply", async (root) => {
      const parsed = await parseLinksBatch(c);
      if ("error" in parsed) return err(c, "links-apply", "bad-usage", parsed.error);
      const resolved = await resolveBatchRequests(root, parsed);
      if (!resolved.ok) return err(c, "links-apply", resolved.code, resolved.message);
      const result = await applyLinkBatch(resolved.items, resolved.action);
      if (!result.ok) {
        return c.json(
          { ok: false, command: "links-apply", code: result.code, message: result.message, conflicts: result.conflicts ?? [] },
          409,
        );
      }
      return c.json({
        ok: true,
        command: "links-apply",
        action: resolved.action,
        created: result.created,
        removed: result.removed,
      });
    }),
  );
}
