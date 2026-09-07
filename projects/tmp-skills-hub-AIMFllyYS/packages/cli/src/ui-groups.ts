import type { Hono } from "hono";
import { readGroups } from "@skills-hub/core";
import { performCreateGroup, performDeleteGroup, performGroupMembers, performUpdateGroup } from "./group-cmds.js";
import { err, withStore, type UiRouteContext } from "./ui-http.js";

export function registerGroupRoutes(app: Hono, ctx: UiRouteContext): void {
  app.get("/api/groups", (c) =>
    withStore(ctx, c, "groups", async (root) => {
      const groups = await readGroups(root);
      return c.json({ ok: true, command: "groups", version: groups.version, groups: groups.groups });
    }),
  );

  app.post("/api/groups", (c) =>
    withStore(ctx, c, "group", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { id?: unknown; name?: unknown; description?: unknown } | null;
      const input: { id: string; name?: string; description?: string } = {
        id: typeof raw?.id === "string" ? raw.id : "",
      };
      if (typeof raw?.name === "string") input.name = raw.name;
      if (typeof raw?.description === "string") input.description = raw.description;
      const result = await performCreateGroup(root, input);
      if (!result.ok) return err(c, "group", result.code, result.message);
      return c.json({ ok: true, command: "group", verb: "create", id: result.id, name: result.name, description: result.description });
    }),
  );

  app.patch("/api/groups/:id", (c) =>
    withStore(ctx, c, "group", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { name?: unknown; description?: unknown } | null;
      const input: { id: string; name?: string; description?: string } = { id: c.req.param("id") ?? "" };
      if (typeof raw?.name === "string") input.name = raw.name;
      if (typeof raw?.description === "string") input.description = raw.description;
      const result = await performUpdateGroup(root, input);
      if (!result.ok) return err(c, "group", result.code, result.message);
      return c.json({ ok: true, command: "group", verb: "rename", id: result.id, name: result.name, description: result.description });
    }),
  );

  app.delete("/api/groups/:id", (c) =>
    withStore(ctx, c, "group", async (root) => {
      const result = await performDeleteGroup(root, c.req.param("id") ?? "");
      if (!result.ok) return err(c, "group", result.code, result.message);
      return c.json({ ok: true, command: "group", verb: "delete", id: result.id, memberCount: result.memberCount });
    }),
  );

  app.post("/api/groups/:id/members", (c) =>
    withStore(ctx, c, "group", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { hashes?: unknown; action?: unknown } | null;
      const action = raw?.action === "remove" ? "remove" : raw?.action === "add" ? "add" : "";
      const hashesIn = Array.isArray(raw?.hashes) ? raw.hashes.filter((h): h is string => typeof h === "string") : [];
      if (action === "" || hashesIn.length === 0) {
        return err(c, "group", "bad-usage", "body 需要 { hashes: string[], action: add|remove }");
      }
      const result = await performGroupMembers(root, { id: c.req.param("id") ?? "", needles: hashesIn, action });
      if (!result.ok) return err(c, "group", result.code, result.message);
      return c.json({ ok: true, command: "group", verb: result.verb, id: result.id, hashes: result.hashes, changed: result.changed });
    }),
  );
}
