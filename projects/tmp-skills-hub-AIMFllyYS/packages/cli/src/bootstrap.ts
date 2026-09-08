import { createInterface } from "node:readline";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import { openBrowser } from "./open-console.js";
import {
  adoptSkillFolder,
  createBackupSnapshot,
  discoverClientRoots,
  ensureBuiltinGroups,
  initializeStoreLayout,
  readPointerStoreRoot,
  readSkillMeta,
} from "@skills-hub/core";
import { resolveHome } from "./home.js";
import { performLinkChange } from "./link-actions.js";
import { POINTER_REL, runAdopt, writePointerFile } from "./store-cmds.js";
import { DEFAULT_UI_PORT, startUiServer, type StartUiServerOptions } from "./ui-server.js";

/**
 * bootstrap:真机一键体验——交互确认(库存位置/备份/迁移)→ 备份 → 收录全部本机 skills → 自动启动面板。
 * 幂等:库存已配置时跳过全部交互,直接启动面板。
 * 写操作铁律不变:交互中的 Y 即显式授权;非 TTY 且无 --yes 拒绝执行。
 */

const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function warn(text: string): void {
  console.error(RED + BOLD + text + RESET);
}

export interface BootstrapArgs {
  /** --home:库存根/基座(默认 ~/.skills-hub) */
  home?: string;
  /** --port:面板端口 */
  port?: number;
  /** --yes:非交互环境显式授权全部写操作 */
  yes?: boolean;
}

export interface BootstrapOptions {
  /** 测试注入:问答实现;缺省用 stdin readline */
  readLine?: (prompt: string) => Promise<string>;
  /**
   * 测试注入:结束时是否启动 ui 服务(默认 true)。
   * 传函数则调用该函数而不真起服务,便于断言传入的 home。
   */
  ui?: boolean | ((opts: StartUiServerOptions) => Promise<void>);
}

async function defaultReadLine(): Promise<(prompt: string) => Promise<string>> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (prompt: string) => new Promise<string>((resolve) => rl.question(prompt, resolve));
  return ask;
}

/** 发现并收录:扫描 base 下全部客户端 root,收集达标 skill 目录,一次批量 adopt。 */
export async function migrateAllSkills(
  baseHome: string,
  storeRoot: string,
): Promise<{ discovered: number; adopted: number; dryRun: boolean }> {
  await initializeStoreLayout(storeRoot);
  await ensureBuiltinGroups(storeRoot);
  // 指针写 home 基座(baseHome)下,与幂等检查(读 baseHome/.skills-hub/config.json)一致;
  // 若写 storeRoot 内部(无 --home 时 storeRoot=~/.skills-hub),下次 bootstrap 会永远判为未配置。
  await writePointerFile(baseHome, storeRoot);
  const roots = await discoverClientRoots(baseHome, { storeRoot });
  const dirs: string[] = [];
  for (const root of roots) {
    let entries;
    try { entries = await readdir(root.skillsDir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      const fp = path.join(root.skillsDir, e.name);
      if ((await readSkillMeta(fp)) !== null) dirs.push(fp);
    }
  }
  const discovered = dirs.length;
  if (dirs.length === 0) return { discovered, adopted: 0, dryRun: false };
  await runAdopt({ _: dirs, home: storeRoot, yes: true, dryRun: false, json: false });
  return { discovered, adopted: dirs.length, dryRun: false };
}

export async function runBootstrap(args: BootstrapArgs, opts: BootstrapOptions = {}): Promise<void> {
  const port = args.port ?? DEFAULT_UI_PORT;
  const base = resolveHome(args.home);
  // 幂等检测:读指针文件(注意不能用 resolveStoreRoot 的 cliHome 直通——它永远 ok)。
  const existingRoot = await readPointerStoreRoot(path.join(base, POINTER_REL));

  if (existingRoot !== null) {
    console.log("库存已就绪:" + existingRoot + " — 跳过初始化,直接启动面板。");
    await launchUi(port, base, opts);
    return;
  }

  // 写操作铁律:非 TTY 且无 --yes → 拒绝
  const interactive = opts.readLine !== undefined || process.stdin.isTTY === true;
  if (!interactive && args.yes !== true) {
    console.error("bootstrap 是交互式命令:非交互环境请加 --yes 显式授权全部写操作。");
    process.exitCode = 2;
    return;
  }
  const ask = opts.readLine ?? (await defaultReadLine());

  // 1. 库存位置(默认:--home 直用,否则 ~/.skills-hub)
  const defaultRoot = args.home !== undefined && args.home !== "" ? path.resolve(args.home) : path.join(base, ".skills-hub");
  const rawRoot = args.yes === true ? defaultRoot : (await ask(`库存将保存在哪个目录?(直接回车使用默认: ${defaultRoot}) > `)).trim();
  const storeRoot = rawRoot === "" ? defaultRoot : path.resolve(rawRoot);

  // 2. 备份确认
  const doBackup = args.yes === true ||
    (await ask(`\n${RED}${BOLD}⚠ 即将把本机全部客户端(如 .claude/.cursor/.codex 等)的 skills 收录进统一库存。${RESET}\n先帮你备份一份保险,如果出现问题可以一键恢复。\n是否自动备份?(Y=备份后继续 / N=跳过备份) > `)).trim().toUpperCase() === "Y";

  if (doBackup) {
    const backupDir = path.join(storeRoot, "backups");
    console.log("正在备份(只读源目录,写入 " + backupDir + ")…");
    const bak = await createBackupSnapshot(storeRoot, base);
    warn(
      "✓ 已备份快照 " + bak.snapshotId +
        " (" + bak.manifest.files.length + " 个文件, " + bak.manifest.links.length + " 条链接, 新增 blob " +
        bak.manifest.blobsWritten + ")\n  校验: skills-hub backup verify。还原: skills-hub backup restore，或面板「恢复到初始化前」。",
    );
  } else {
    console.log("已跳过备份。");
  }

  // 3. 迁移确认
  const doMigrate = args.yes === true ||
    (await ask(`${RED}${BOLD}⚠ 即将把全部 skills 收录进库存 ${storeRoot}(重复内容自动去重,冲突绝不覆盖)。${RESET}\n输入 Y 开始迁移,输入其他任意键取消 > `)).trim().toUpperCase() === "Y";
  if (!doMigrate) {
    console.log("已取消,未做任何改动。");
    return;
  }

  // 4. 自动执行:建布局 → 收录全部 → 完成提示
  const result = await migrateAllSkills(base, storeRoot);
  warn(`✓ 全部完成:库存位于 ${storeRoot},收录 ${result.adopted} 份(新增/重复/冲突见上方统计)。`);
  if (result.discovered === 0) console.log("未发现任何达标 skill(缺 name/description 的目录不计入)。");

  // 4b. 收录并启用自身 skill(#169)
  await adoptAndEnableSelfSkill(base, storeRoot);

  // 5. 自动启动面板——必须传 home 基座,不能传 storeRoot(#95)
  if (opts.ui !== false) {
    console.log("启动面板:http://127.0.0.1:" + port);
  }
  await launchUi(port, base, opts);
}

/**
 * Adopt the skills-hub self-skill and enable it to all discovered clients.
 * Idempotent: skips if already in the store.
 */
async function adoptAndEnableSelfSkill(home: string, storeRoot: string): Promise<void> {
  const selfSkillDir = findSelfSkillDir();
  if (selfSkillDir === null) return;
  try {
    const outcome = await adoptSkillFolder(storeRoot, selfSkillDir, { kind: "authored", reference: "bootstrap" });
    if (outcome.kind !== "adopted" && outcome.kind !== "duplicate") return;
    const record = outcome.record;
    const roots = await discoverClientRoots(home, { storeRoot });
    for (const root of roots) {
      try {
        await performLinkChange(
          { storeRoot, clientId: root.clientId, scope: "global", skillsDir: root.skillsDir, dirNames: [record.dirName] },
          "enable",
        );
      } catch {
        // best-effort: skip clients where linking fails
      }
    }
  } catch {
    // self-skill adoption is best-effort
  }
}

function findSelfSkillDir(): string | null {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const cliSrc = path.dirname(thisFile);
    const candidates = [
      path.resolve(cliSrc, "..", "self-skill", "SKILL.md"),
      path.resolve(cliSrc, "self-skill", "SKILL.md"),
    ];
    for (const c of candidates) {
      try {
        if (statSync(c).isFile()) return path.dirname(c);
      } catch {
        // continue
      }
    }
  } catch {
    // fallback
  }
  return null;
}

/** 启动面板:home 永远是客户端发现基座。测试可注入函数替身。 */
async function launchUi(port: number, home: string, opts: BootstrapOptions): Promise<void> {
  if (opts.ui === false) return;
  const start = typeof opts.ui === "function" ? opts.ui : startUiServer;
  await start({ port, home });
  if (typeof opts.ui !== "function") openBrowser("http://127.0.0.1:" + port);
}
