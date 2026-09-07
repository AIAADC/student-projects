import path from "node:path";
import type { Hono } from "hono";
import { listSkillFiles, readSkillFile, readStoreIndex, saveSkillFile } from "@skills-hub/core";
import { resolveSkill, type ResolveSkillFailure } from "./resolve-skill.js";
import { err, skillLookupErr, withStore, type UiRouteContext } from "./ui-http.js";

async function resolveSkillDir(
  root: string,
  needle: string,
): Promise<{ ok: true; skillDir: string } | ResolveSkillFailure> {
  const hit = resolveSkill(needle, await readStoreIndex(root));
  if (!hit.ok) return hit;
  return { ok: true, skillDir: path.join(root, "skills", hit.skill.dirName) };
}

export function registerContentRoutes(app: Hono, ctx: UiRouteContext): void {
  app.get("/api/skills/:hash/tree", (c) =>
    withStore(ctx, c, "skill-tree", async (root) => {
      const found = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (!found.ok) return skillLookupErr(c, "skill-tree", found);
      const res = await listSkillFiles(found.skillDir);
      if (!res.ok) return err(c, "skill-tree", res.code, res.message);
      return c.json({ ok: true, command: "skill-tree", dirName: path.basename(found.skillDir), entries: res.entries, truncated: res.truncated });
    }),
  );

  app.get("/api/skills/:hash/file", (c) =>
    withStore(ctx, c, "skill-file", async (root) => {
      const found = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (!found.ok) return skillLookupErr(c, "skill-file", found);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-file", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)");
      const res = await readSkillFile(found.skillDir, rel);
      if (!res.ok) return err(c, "skill-file", res.code, res.message);
      return c.json({ ok: true, command: "skill-file", dirName: path.basename(found.skillDir), path: rel, content: res.content, sizeBytes: res.sizeBytes });
    }),
  );

  app.put("/api/skills/:hash/file", (c) =>
    withStore(ctx, c, "skill-file-save", async (root) => {
      const found = await resolveSkillDir(root, c.req.param("hash") ?? "");
      if (!found.ok) return skillLookupErr(c, "skill-file-save", found);
      const rel = c.req.query("path") ?? "";
      if (rel === "") return err(c, "skill-file-save", "bad-usage", "缺少 path 查询参数(?path=SKILL.md)");
      const body = (await c.req.json().catch(() => null)) as { content?: unknown } | null;
      if (body === null || typeof body?.content !== "string") {
        return err(c, "skill-file-save", "bad-usage", "body 需要 { content: string }");
      }
      const res = await saveSkillFile({ storeRoot: root, skillDir: found.skillDir, relPath: rel, content: body.content });
      if (!res.ok) return err(c, "skill-file-save", res.code, res.message);
      return c.json({ ok: true, command: "skill-file-save", dirName: path.basename(found.skillDir), path: rel, hash: res.newHash });
    }),
  );
}
