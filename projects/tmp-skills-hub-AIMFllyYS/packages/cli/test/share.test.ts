import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adoptMany, initializeStoreLayout } from "@skills-hub/core";
import { GitHubSourceProvider } from "../src/github-source.js";
import { parseTrustedRepo, performShare, shareTreeUrl } from "../src/share.js";
import { POINTER_REL } from "../src/store-cmds.js";

const temps: string[] = [];
const SKILL_BODY = ["---", "name: demo", "description: share demo", "---", "", "# demo", ""].join("\n") + "\n";

async function tmp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temps.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

async function primedStore(): Promise<string> {
  const home = await tmp("skills-hub-share-");
  await initializeStoreLayout(home);
  await mkdir(path.dirname(path.join(home, POINTER_REL)), { recursive: true });
  await writeFile(path.join(home, POINTER_REL), JSON.stringify({ storeRoot: home }, null, 2) + "\n");
  const src = path.join(home, "src-demo");
  await mkdir(src, { recursive: true });
  await writeFile(path.join(src, "SKILL.md"), SKILL_BODY);
  await adoptMany(home, [{ folderPath: src, origin: { kind: "local-scan", reference: src } }]);
  return home;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function shareFetch(opts: {
  treePaths?: string[];
  raw?: Record<string, string>;
  posted?: Array<{ path: string; content: string }>;
}): typeof fetch {
  return async (url, init) => {
    const u = String(url);
    const method = (init?.method ?? "GET").toUpperCase();
    if (u === "https://api.github.com/repos/club/skills" && method === "GET") {
      return json({ default_branch: "main" });
    }
    if (u.includes("/git/trees/main")) {
      return json({ tree: (opts.treePaths ?? []).map((p) => ({ path: p, type: "blob" })) });
    }
    if (u.includes("/git/ref/heads/main") && method === "GET") {
      return json({ object: { sha: "aaa111aaa111aaa111aaa111aaa111aaa111aaaa" } });
    }
    if (u.includes("/git/commits/aaa111") && method === "GET") {
      return json({ tree: { sha: "tree111tree111tree111tree111tree111tree1" } });
    }
    if (u.endsWith("/git/trees") && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { tree?: Array<{ path: string; content: string }> };
      opts.posted?.push(...(body.tree ?? []));
      return json({ sha: "tree222tree222tree222tree222tree222tree2" }, 201);
    }
    if (u.endsWith("/git/commits") && method === "POST") {
      return json({ sha: "ccc222ccc222ccc222ccc222ccc222ccc222cccc" }, 201);
    }
    if (u.includes("/git/refs/heads/main") && method === "PATCH") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { force?: boolean };
      expect(body.force).toBe(false);
      return json({ object: { sha: "ccc222ccc222ccc222ccc222ccc222ccc222cccc" } });
    }
    if (u.startsWith("https://raw.githubusercontent.com/")) {
      const raw = opts.raw ?? {};
      const hit = Object.keys(raw).find((k) => u.endsWith("/" + k) || u.includes("/" + k));
      if (hit === undefined) return new Response("missing", { status: 404 });
      return new Response(raw[hit], { status: 200 });
    }
    return new Response("unhandled " + method + " " + u, { status: 404 });
  };
}

describe("parseTrustedRepo", () => {
  it("接受 owner/repo 与 GitHub URL", () => {
    expect(parseTrustedRepo("club/skills")).toEqual({ owner: "club", repo: "skills" });
    expect(parseTrustedRepo("https://github.com/club/skills")).toEqual({ owner: "club", repo: "skills" });
    expect(parseTrustedRepo("not a repo")).toBeNull();
  });
});

describe("performShare", () => {
  it("无 token 不发网", async () => {
    const store = await primedStore();
    const prev = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const r = await performShare(store, "demo", { repo: "club/skills", fetchImpl: async () => {
        throw new Error("should not fetch");
      } });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("auth-required");
    } finally {
      if (prev !== undefined) process.env.GITHUB_TOKEN = prev;
    }
  });

  it("成功返回可被 adopt 识别的 tree 链接", async () => {
    const store = await primedStore();
    const posted: Array<{ path: string; content: string }> = [];
    const fetchImpl = shareFetch({ posted });
    const r = await performShare(store, "demo", { repo: "club/skills", token: "t", fetchImpl });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.idempotent).toBe(false);
    expect(r.url).toBe(shareTreeUrl("club", "skills", "main", "demo"));
    expect(posted.some((p) => p.path === "skills/demo/SKILL.md")).toBe(true);

    const raw: Record<string, string> = {};
    for (const p of posted) raw[p.path] = p.content;
    const adoptFetch = shareFetch({
      treePaths: posted.map((p) => p.path),
      raw,
    });
    const provider = new GitHubSourceProvider(store, { fetchImpl: adoptFetch, token: "t" });
    const dirs = await provider.fetch(r.url);
    expect(dirs).toHaveLength(1);
    expect(path.basename(dirs[0] ?? "")).toBe("demo");
    expect(await readFile(path.join(dirs[0] ?? "", "SKILL.md"), "utf8")).toBe(SKILL_BODY);
  });

  it("远端同名不同内容 → remote-conflict,不覆盖", async () => {
    const store = await primedStore();
    const fetchImpl = shareFetch({
      treePaths: ["skills/demo/SKILL.md"],
      raw: { "skills/demo/SKILL.md": "---\nname: demo\ndescription: other\n---\n" },
    });
    const r = await performShare(store, "demo", { repo: "club/skills", token: "t", fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("remote-conflict");
  });

  it("远端同名同内容 → 幂等成功", async () => {
    const store = await primedStore();
    const fetchImpl = shareFetch({
      treePaths: ["skills/demo/SKILL.md"],
      raw: { "skills/demo/SKILL.md": SKILL_BODY },
    });
    const r = await performShare(store, "demo", { repo: "club/skills", token: "t", fetchImpl });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.idempotent).toBe(true);
  });
});
