import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPointerStoreRoot, resolveStoreRoot } from "./store-location.js";

/**
 * 库存位置解析:优先级 cli → env → 指针文件 → 报错提示先初始化(spec §1)。
 * 全部用例使用系统临时目录,绝不触碰真实 home。
 */

const tempDirs: string[] = [];

async function fakeHome(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "skills-hub-store-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("resolveStoreRoot: 优先级", () => {
  it("显式参数 --home 优先于环境变量与指针文件", async () => {
    const home = await fakeHome();
    const pointer = path.join(home, "config.json");
    await writeFile(pointer, JSON.stringify({ storeRoot: path.join(home, "from-pointer") }));

    const r = await resolveStoreRoot({
      cliHome: path.join(home, "from-cli"),
      envHome: path.join(home, "from-env"),
      pointerFilePath: pointer,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("cli");
      expect(r.storeRoot).toBe(path.join(home, "from-cli"));
    }
  });

  it("环境变量 SKILLS_HUB_HOME 优先于指针文件", async () => {
    const home = await fakeHome();
    const pointer = path.join(home, "config.json");
    await writeFile(pointer, JSON.stringify({ storeRoot: path.join(home, "from-pointer") }));

    const r = await resolveStoreRoot({ envHome: path.join(home, "from-env"), pointerFilePath: pointer });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("env");
      expect(r.storeRoot).toBe(path.join(home, "from-env"));
    }
  });

  it("指针文件生效(仅当显式参数与环境变量都缺省)", async () => {
    const home = await fakeHome();
    const pointer = path.join(home, "config.json");
    await writeFile(pointer, JSON.stringify({ storeRoot: path.join(home, "from-pointer") }));

    const r = await resolveStoreRoot({ pointerFilePath: pointer });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("pointer");
      expect(r.storeRoot).toBe(path.join(home, "from-pointer"));
    }
  });

  it("都未配置时返回可操作错误,提示先初始化,绝不回退用户目录", async () => {
    const r = await resolveStoreRoot({});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not-configured");
      expect(r.message).toContain("skills-hub init");
      expect(r.message).toContain("未配置");
    }
  });
});

describe("resolveStoreRoot: 边界", () => {
  it("指针文件不存在 → not-configured 且提示初始化", async () => {
    const r = await resolveStoreRoot({ pointerFilePath: path.join(os.tmpdir(), "no-such-config-" + Date.now() + ".json") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-configured");
  });

  it("指针文件缺少 storeRoot / 空值 / 非法 JSON → not-configured", async () => {
    const home = await fakeHome();
    const cases = ['{"other": 1}', '{"storeRoot": ""}', '{"storeRoot": 42}', "not json at all"];
    for (const [i, content] of cases.entries()) {
      const pointer = path.join(home, "config-" + i + ".json");
      await writeFile(pointer, content);
      const r = await resolveStoreRoot({ pointerFilePath: pointer });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not-configured");
    }
  });

  it("相对路径被拒绝(cli/env → invalid-path,指针 → invalid-pointer)", async () => {
    const home = await fakeHome();
    const cli = await resolveStoreRoot({ cliHome: "relative/store" });
    expect(cli.ok).toBe(false);
    if (!cli.ok) expect(cli.reason).toBe("invalid-path");

    const env = await resolveStoreRoot({ envHome: "relative/store" });
    expect(env.ok).toBe(false);
    if (!env.ok) expect(env.reason).toBe("invalid-path");

    const pointer = path.join(home, "config.json");
    await writeFile(pointer, JSON.stringify({ storeRoot: "relative/store" }));
    const p = await resolveStoreRoot({ pointerFilePath: pointer });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toBe("invalid-pointer");
  });

  it("空白输入视为未提供", async () => {
    const r = await resolveStoreRoot({ cliHome: "   ", envHome: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-configured");
  });
});

describe("readPointerStoreRoot", () => {
  it("读取合法指针文件", async () => {
    const home = await fakeHome();
    const pointer = path.join(home, "config.json");
    await writeFile(pointer, JSON.stringify({ storeRoot: path.join(home, "SkillsHub") }));
    expect(await readPointerStoreRoot(pointer)).toBe(path.join(home, "SkillsHub"));
  });

  it("文件缺失/非法 JSON/缺字段 → null", async () => {
    const home = await fakeHome();
    expect(await readPointerStoreRoot(path.join(home, "missing.json"))).toBeNull();

    const bad = path.join(home, "bad.json");
    await writeFile(bad, "oops");
    expect(await readPointerStoreRoot(bad)).toBeNull();

    const noField = path.join(home, "nofield.json");
    await writeFile(noField, "{}");
    expect(await readPointerStoreRoot(noField)).toBeNull();
  });
});
