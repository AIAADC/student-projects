import { mkdtemp, mkdir, readdir, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { discoverClientRoots, isExcludedRoot, isOwnClientId } from "./clients.js";

/**
 * 客户端 root 发现:按目录形状扫描,不维护品牌名单。
 * 验收口径:docs/specs/store-and-paths-v0.md §4 + issue #13。
 * 所有用例都在临时假 home 上运行,绝不触碰真实 home。
 */

const tempDirs: string[] = [];

async function fakeHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-roots-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("discoverClientRoots: 目录形状扫描", () => {
  it("直接子目录形状:<home>/<client>/skills 存在即为 root", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(home, ".codex", "skills"), { recursive: true });
    await mkdir(path.join(home, ".some-tool"), { recursive: true }); // 无 skills 子目录

    const roots = await discoverClientRoots(home);
    expect(roots.map((r) => r.clientId).sort()).toEqual(["claude", "codex"]);
  });

  it("home 不存在/不可读时返回空数组,不创建任何目录", async () => {
    const missing = path.join(os.tmpdir(), "skills-hub-never-exists-" + Date.now());
    const roots = await discoverClientRoots(missing);
    expect(roots).toEqual([]);
    expect(await readdir(os.tmpdir()).catch(() => [])).not.toContain(path.basename(missing));
  });

  it("空 home 返回空数组,且不产生任何副作用", async () => {
    const home = await fakeHome();
    const before = await readdir(home);
    const roots = await discoverClientRoots(home);
    expect(roots).toEqual([]);
    expect(await readdir(home)).toEqual(before);
  });

  it("已知嵌套惯例被覆盖:.cursor/skills-cursor、.gemini/antigravity/skills、.codeium/windsurf/skills", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".cursor", "skills-cursor"), { recursive: true });
    await mkdir(path.join(home, ".gemini", "antigravity", "skills"), { recursive: true });
    await mkdir(path.join(home, ".codeium", "windsurf", "skills"), { recursive: true });

    const roots = await discoverClientRoots(home);
    expect(roots.map((r) => r.clientId).sort()).toEqual(["cursor", "gemini", "windsurf"]);
    const byId = new Map(roots.map((r) => [r.clientId, r.skillsDir]));
    // 返回值为 realpath 归一化结果(CI 上 tmpdir 可能是 8.3 短名,须按归一化后比较)
    expect(byId.get("cursor")).toBe(await realpath(path.join(home, ".cursor", "skills-cursor")));
    expect(byId.get("gemini")).toBe(await realpath(path.join(home, ".gemini", "antigravity", "skills")));
    expect(byId.get("windsurf")).toBe(await realpath(path.join(home, ".codeium", "windsurf", "skills")));
  });

  it("嵌套惯例不存在时不报错、不产生 root", async () => {
    const home = await fakeHome();
    const roots = await discoverClientRoots(home);
    expect(roots).toEqual([]);
  });

  it("XDG 风格:config/<client>/skills 被覆盖(Devin CLI / OpenCode)", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".config", "opencode", "skills"), { recursive: true });
    await mkdir(path.join(home, ".config", "devin", "skills"), { recursive: true });
    await mkdir(path.join(home, ".config", "git"), { recursive: true }); // 无 skills,不应命中

    const roots = await discoverClientRoots(home);
    expect(roots.map((r) => r.clientId).sort()).toEqual(["devin", "opencode"]);
  });

  it("同一 home 内直接形状 + 嵌套 + XDG 混合,全部发现且不重复", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(home, ".cursor", "skills"), { recursive: true });
    await mkdir(path.join(home, ".cursor", "skills-cursor"), { recursive: true });
    await mkdir(path.join(home, ".config", "opencode", "skills"), { recursive: true });

    const roots = await discoverClientRoots(home);
    // .cursor/skills 与 .cursor/skills-cursor 是两个不同真实目录,各自成 root,clientId 相同
    expect(roots.map((r) => r.clientId).sort()).toEqual(["claude", "cursor", "cursor", "opencode"]);
    expect(new Set(roots.map((r) => r.skillsDir)).size).toBe(roots.length);
  });
});

describe("discoverClientRoots: 真实路径去重", () => {
  let junctionOk = false;

  beforeAll(async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    try {
      await symlink(
        path.join(home, ".claude", "skills"),
        path.join(home, ".agents", "skills"),
        "junction",
      );
      junctionOk = true;
    } catch {
      junctionOk = false; // 极少数环境(无 junction 权限)跳过链接用例
    }
  });

  it.runIf(junctionOk)("互为链接的两个 root 只保留一个(先到者胜)", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    await symlink(
      path.join(home, ".claude", "skills"),
      path.join(home, ".agents", "skills"),
      "junction",
    );

    const roots = await discoverClientRoots(home);
    expect(roots).toHaveLength(1);
    // 排序后 .agents 先于 .claude,先到者胜
    expect(roots[0]!.clientId).toBe("agents");
    expect(roots[0]!.skillsDir).toBe(await realpath(path.join(home, ".claude", "skills")));
  });

  it.runIf(junctionOk)("链接目标被解析为真实路径", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, "store", "skills"), { recursive: true });
    await symlink(
      path.join(home, "store", "skills"),
      path.join(home, ".cursor", "skills"),
      "junction",
    );

    const roots = await discoverClientRoots(home);
    expect(roots).toHaveLength(1);
    expect(roots[0]!.skillsDir).toBe(path.join(home, "store", "skills"));
    expect(roots[0]!.skillsDir).not.toContain(".cursor");
  });
});

describe("isOwnClientId", () => {
  it("skills-hub 及带后缀变体为本项目,其它客户端不是", () => {
    expect(isOwnClientId("skills-hub")).toBe(true);
    expect(isOwnClientId(".skills-hub")).toBe(true);
    expect(isOwnClientId("skills-hub.pre-bootstrap-20260101T000000")).toBe(true);
    expect(isOwnClientId("Skills-Hub.bak")).toBe(true);
    expect(isOwnClientId("claude")).toBe(false);
    expect(isOwnClientId("skills-hubx")).toBe(false);
  });
});

describe("isExcludedRoot: 排除清单", () => {
  const HOME = "/home/u";

  it("内置技能目录被排除", () => {
    expect(isExcludedRoot(HOME + "/.claude/builtin_skills", HOME)).toBe(true);
  });

  it("插件/市场缓存被排除", () => {
    expect(isExcludedRoot(HOME + "/.claude/plugins/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.cursor/plugins", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.config/cache/skills", HOME)).toBe(true);
  });

  it("扩展目录被排除", () => {
    expect(isExcludedRoot(HOME + "/.cursor/extensions/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.vscode/extensions/skills", HOME)).toBe(true);
  });

  it("浏览器 profile 被排除", () => {
    expect(isExcludedRoot(HOME + "/.config/google-chrome/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.config/firefox/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.config/msedge/skills", HOME)).toBe(true);
  });

  it("临时目录被排除", () => {
    expect(isExcludedRoot("/tmp/skills", "/")).toBe(true);
    expect(isExcludedRoot(HOME + "/.cache/skills", HOME)).toBe(true);
  });

  it("正常客户端目录不被误伤", () => {
    expect(isExcludedRoot(HOME + "/.claude/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.codex/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.cursor/skills-cursor", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.gemini/antigravity/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.codeium/windsurf/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.trae-cn/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.quickwork/skills", HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/.config/opencode/skills", HOME)).toBe(false);
  });

  it("大小写不敏感", () => {
    expect(isExcludedRoot(HOME + "/.CLAUDE/PLUGINS/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.Claude/Skills", HOME)).toBe(false);
  });

  it("本项目自己的目录按前缀排除:.skills-hub 及其带后缀变体", () => {
    expect(isExcludedRoot(HOME + "/.skills-hub/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.skills-hub.pre-bootstrap-20260101T000000/skills", HOME)).toBe(true);
    expect(isExcludedRoot(HOME + "/.skills-hub.bak/skills", HOME)).toBe(true);
  });

  it("库存根显式传入时,即使位于 home 下也被排除", () => {
    const store = HOME + "/my-store";
    expect(isExcludedRoot(store + "/skills", HOME, store)).toBe(true);
    expect(isExcludedRoot(HOME + "/.claude/skills", HOME, store)).toBe(false);
  });

  it("storeRoot 等于 home 时不误杀 .claude 等客户端(--home 双重语义)", () => {
    expect(isExcludedRoot(HOME + "/.claude/skills", HOME, HOME)).toBe(false);
    expect(isExcludedRoot(HOME + "/skills", HOME, HOME)).toBe(true);
  });

  it("排除只针对 home 之下的段:home 自身路径含 tmp/temp 不误杀", () => {
    const tmpHome = "/var/folders/xx/Temp/skills-hub-test-home";
    expect(isExcludedRoot(tmpHome + "/.claude/skills", tmpHome)).toBe(false);
    expect(isExcludedRoot(tmpHome + "/.claude/skills", tmpHome + "/.claude")).toBe(false);
  });
});

describe("discoverClientRoots: 沙箱隔离与确定性", () => {
  it("假 home 只发现假 home 下的 root,不泄漏到真实 home", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });

    const roots = await discoverClientRoots(home);
    expect(roots.map((r) => r.clientId)).toEqual(["claude"]);
    for (const root of roots) {
      // skillsDir 是 realpath 归一化结果;home 可能是 8.3 短名,先归一化再判前缀
      expect(root.skillsDir.startsWith(await realpath(home))).toBe(true);
    }
  });

  it("输出按 clientId 排序,结果确定", async () => {
    const home = await fakeHome();
    // 乱序创建
    await mkdir(path.join(home, ".zeta", "skills"), { recursive: true });
    await mkdir(path.join(home, ".alpha", "skills"), { recursive: true });
    await mkdir(path.join(home, ".config", "mid", "skills"), { recursive: true });

    const a = await discoverClientRoots(home);
    const b = await discoverClientRoots(home);
    expect(a.map((r) => r.clientId)).toEqual(["alpha", "mid", "zeta"]);
    expect(b).toEqual(a);
  });
});

describe("discoverClientRoots: 本项目目录与库存根", () => {
  it("不把 .skills-hub 及其 pre-bootstrap 变体当成客户端,仍发现 .claude", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, ".skills-hub", "skills"), { recursive: true });
    await mkdir(path.join(home, ".skills-hub.pre-bootstrap-20260101T000000", "skills"), { recursive: true });
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });

    const roots = await discoverClientRoots(home);
    expect(roots.map((r) => r.clientId)).toEqual(["claude"]);
  });

  it("库存根显式传入时,即使位于 home 下也不被当成客户端", async () => {
    const home = await fakeHome();
    const store = path.join(home, "my-store");
    await mkdir(path.join(store, "skills"), { recursive: true });
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });

    const without = await discoverClientRoots(home);
    expect(without.map((r) => r.clientId).sort()).toEqual(["claude", "my-store"]);

    const withStore = await discoverClientRoots(home, { storeRoot: store });
    expect(withStore.map((r) => r.clientId)).toEqual(["claude"]);
  });

  it("storeRoot 等于 home 时仍发现 .claude(--home 双重语义)", async () => {
    const home = await fakeHome();
    await mkdir(path.join(home, "skills"), { recursive: true });
    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });

    const roots = await discoverClientRoots(home, { storeRoot: home });
    expect(roots.map((r) => r.clientId)).toEqual(["claude"]);
  });
});
