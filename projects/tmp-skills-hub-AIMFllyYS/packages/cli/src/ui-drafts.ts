import type { Hono } from "hono";
import { listDrafts } from "@skills-hub/core";
import { performAllocate, performCommit, performCreate, performDiscard } from "./create-cmds.js";
import { err, withStore, type UiRouteContext } from "./ui-http.js";

export function registerDraftRoutes(app: Hono, ctx: UiRouteContext): void {
  app.get("/api/drafts", (c) =>
    withStore(ctx, c, "drafts", async (root) => {
      const drafts = await listDrafts(root);
      return c.json({ ok: true, command: "drafts", drafts });
    }),
  );

  app.post("/api/drafts", (c) =>
    withStore(ctx, c, "new", async (root) => {
      const raw = (await c.req.json().catch(() => null)) as { dirName?: unknown; description?: unknown } | null;
      const dirName = typeof raw?.dirName === "string" ? raw.dirName.trim() : "";
      const description = typeof raw?.description === "string" ? raw.description.trim() : "";
      const origin = { kind: "authored" as const, reference: "web" };
      const result =
        description !== ""
          ? await performCreate(root, dirName, description, origin)
          : await performAllocate(root, dirName, { origin });
      if (!result.ok) return err(c, "new", result.code, result.message);
      if (result.verb === "create") {
        return c.json({
          ok: true,
          command: "new",
          verb: "create",
          dirName: result.dirName,
          hash: result.hash,
          storeDir: result.storeDir,
        });
      }
      return c.json({ ok: true, command: "new", verb: "allocate", dirName: result.dirName, storeDir: result.storeDir });
    }),
  );

  app.post("/api/drafts/:dirName/commit", (c) =>
    withStore(ctx, c, "new", async (root) => {
      const result = await performCommit(root, c.req.param("dirName"));
      if (!result.ok) return err(c, "new", result.code, result.message);
      return c.json({ ok: true, command: "new", verb: "commit", dirName: result.dirName, hash: result.hash });
    }),
  );

  app.post("/api/drafts/:dirName/discard", (c) =>
    withStore(ctx, c, "new", async (root) => {
      const result = await performDiscard(root, c.req.param("dirName"));
      if (!result.ok) return err(c, "new", result.code, result.message);
      return c.json({ ok: true, command: "new", verb: "discard", dirName: result.dirName, archivePath: result.archivePath });
    }),
  );
}
