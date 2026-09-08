/**
 * 面板真机冒烟回归 (#100)
 *
 * 用沙箱 home + 沙箱库存起 UI,经 Chrome DevTools Protocol 断言功能与性能阈值。
 * 不引入 playwright/puppeteer;不写真实客户端目录;跑完删除沙箱。
 *
 * 用法: pnpm smoke
 * 环境: CHROME_PATH 可覆盖浏览器路径
 * 退出码: 0 通过或无 Chrome 跳过; 1 断言失败 / 缺构建产物 / 启动失败
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const BODY_MARKER = "smoke-panel-body-marker";
const EXPECTED_CARDS = 1;
const FETCH_MAX = 2;
const IDLE_CPU_MAX_S = 0.1;
const LONG_TASK_MAX_MS = 200;
const CLICK_WINDOW_MS = 4000;
const IDLE_MS = 10_000;
const SCALE_COUNT = 1000;
const LIST_DOM_MAX = 3000;
const RENDERED_CARD_MAX = 80;

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(repo, "packages", "cli", "dist", "index.js");
const webIndex = path.join(repo, "apps", "web", "dist", "index.html");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`skills-hub 面板冒烟

用法:  pnpm smoke
       node scripts/smoke-panel.mjs

需先 pnpm build。无 Chrome 时跳过并退出 0。
CHROME_PATH 可指定浏览器可执行文件。`);
  process.exit(0);
}

function findChrome() {
  const extra = process.env.CHROME_PATH?.trim();
  const candidates = [
    extra,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter((p) => typeof p === "string" && p !== "");
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const names = process.platform === "win32"
    ? ["chrome.exe", "chrome"]
    : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];
  const finder = process.platform === "win32" ? "where" : "which";
  for (const name of names) {
    try {
      const out = execFileSync(finder, [name], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
      if (out && existsSync(out)) return out;
    } catch {
      /* 下一个 */
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr !== null ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function runCli(args) {
  return execFileSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function stopChild(child) {
  if (child === undefined || child.exitCode !== null) return;
  child.kill();
}

/**
 * @param {string} name
 * @param {string} measured
 * @param {string} threshold
 * @param {boolean} ok
 * @param {string} [hint]
 */
function line(name, measured, threshold, ok, hint) {
  const tag = ok ? "pass" : "FAIL";
  const row = `[${tag}] ${name.padEnd(22)} 实测 ${measured}  阈值 ${threshold}`;
  console.log(hint && !ok ? row + "\n       → " + hint : row);
  return ok;
}

/** 等到表达式为 true;超时返回 false。 */
async function waitUntil(evalJs, expression, attempts, delayMs) {
  for (let i = 0; i < attempts; i++) {
    if ((await evalJs(expression)) === true) return true;
    await sleep(delayMs);
  }
  return false;
}

/**
 * 点 Skills → 等目录加载完(内容 tab 出现) → 切到内容页并确认面板已挂上。
 * 失败返回原因;成功返回 null。
 */
async function openSkillsContentTab(evalJs) {
  if (!(await waitUntil(evalJs, '!!document.querySelector("[data-testid=nav-skills]")', 80, 250))) {
    return "找不到 Skills 导航";
  }
  await evalJs(`(() => { const n = document.querySelector("[data-testid=nav-skills]"); if (n) n.click(); return true; })()`);
  if (
    !(await waitUntil(
      evalJs,
      '!document.querySelector("[data-testid=page-skeleton]") && !!document.querySelector("[data-testid=skills-tab-content]")',
      80,
      250,
    ))
  ) {
    return "Skills 内容 tab 未出现(主区仍在加载)";
  }
  await evalJs(`(() => { const t = document.querySelector("[data-testid=skills-tab-content]"); if (t) t.click(); return true; })()`);
  if (
    !(await waitUntil(
      evalJs,
      `(() => {
        const tab = document.querySelector("[data-testid=skills-tab-content]");
        const pane = document.querySelector("[data-testid=skills-content-pane]");
        const apps = document.querySelector("[data-testid=skills-apps-pane]");
        return !!(tab && tab.getAttribute("aria-selected") === "true" && pane && !apps);
      })()`,
      40,
      100,
    ))
  ) {
    return "未能切到内容 tab(仍停在应用页)";
  }
  return null;
}

async function waitHttp(url, timeoutMs) {
  const end = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < end) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      last = "HTTP " + res.status;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(200);
  }
  throw new Error("服务未就绪: " + url + " (" + last + ")");
}

async function connectCdp(debugPort) {
  let info;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch("http://127.0.0.1:" + debugPort + "/json/version");
      if (res.ok) {
        info = await res.json();
        break;
      }
    } catch {
      /* 等 Chrome 起来 */
    }
    await sleep(250);
  }
  if (info === undefined || typeof info.webSocketDebuggerUrl !== "string") {
    throw new Error("Chrome CDP 未就绪(端口 " + debugPort + ")");
  }
  const ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(undefined));
    ws.addEventListener("error", () => reject(new Error("CDP WebSocket 连接失败")));
  });
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id === undefined) return;
    const slot = pending.get(msg.id);
    if (slot === undefined) return;
    pending.delete(msg.id);
    if (msg.error !== undefined) slot.reject(new Error(JSON.stringify(msg.error)));
    else slot.resolve(msg.result);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId !== undefined) payload.sessionId = sessionId;
      ws.send(JSON.stringify(payload));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evalJs = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false }, sessionId);
    if (r.exceptionDetails !== undefined) {
      const d = r.exceptionDetails;
      throw new Error("JS: " + (d.exception?.description ?? d.text));
    }
    return r.result.value;
  };
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Performance.enable", {}, sessionId);
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1400,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  }, sessionId);
  return { ws, send, evalJs, sessionId };
}

async function metricsOf(send, sessionId) {
  const { metrics } = await send("Performance.getMetrics", {}, sessionId);
  const get = (name) => metrics.find((m) => m.name === name)?.value ?? 0;
  return { taskDur: get("TaskDuration") };
}

async function main() {
  const chromePath = findChrome();
  if (chromePath === null) {
    console.log("跳过: 本机未找到 Chrome。安装 Chrome 或设置 CHROME_PATH 后再跑。");
    console.log("退出码 0(环境缺失,不视为失败)。");
    return 0;
  }
  if (!existsSync(cli) || !existsSync(webIndex)) {
    console.error("缺少构建产物。请先运行 pnpm build,再 pnpm smoke。");
    return 1;
  }

  const trash = [];
  let ui;
  let chrome;
  let ws;
  try {
    const home = await mkdtemp(path.join(tmpdir(), "skills-hub-smoke-"));
    const sample = await mkdtemp(path.join(tmpdir(), "skills-hub-smoke-sample-"));
    const profile = await mkdtemp(path.join(tmpdir(), "skills-hub-smoke-chrome-"));
    trash.push(home, sample, profile);

    await mkdir(path.join(home, ".claude", "skills"), { recursive: true });
    await mkdir(path.join(home, ".cursor", "skills"), { recursive: true });
    await writeFile(
      path.join(sample, "SKILL.md"),
      [
        "---",
        "name: smoke-demo",
        "description: panel smoke fixture",
        "---",
        "",
        "# smoke-demo",
        "",
        BODY_MARKER,
        "",
      ].join("\n"),
      "utf8",
    );

    runCli(["init", "--home", home, "--yes", "--json"]);
    runCli(["adopt", sample, "--home", home, "--yes", "--json"]);

    const uiPort = await freePort();
    const debugPort = await freePort();
    if (uiPort === 4321) throw new Error("抽到了用户常用端口 4321,拒绝占用");

    ui = spawn(process.execPath, [cli, "ui", "--port", String(uiPort), "--home", home], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let uiErr = "";
    ui.stderr?.on("data", (buf) => {
      uiErr += String(buf);
    });
    ui.on("exit", (code) => {
      if (code !== null && code !== 0 && uiErr !== "") {
        console.error("UI 进程退出 " + code + ": " + uiErr.slice(0, 400));
      }
    });
    const panelUrl = "http://127.0.0.1:" + uiPort + "/";
    await waitHttp(panelUrl + "api/skills", 15_000);

    const skillsBody = await (await fetch(panelUrl + "api/skills")).json();
    const skillCount = Array.isArray(skillsBody.skills) ? skillsBody.skills.length : 0;
    if (skillCount < EXPECTED_CARDS) {
      console.error("沙箱库存没有样例 skill(API 返回 " + skillCount + "),无法冒烟。");
      return 1;
    }

    chrome = spawn(
      chromePath,
      [
        "--headless=new",
        "--remote-debugging-port=" + debugPort,
        "--remote-debugging-address=127.0.0.1",
        "--user-data-dir=" + profile,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1400,1000",
        "about:blank",
      ],
      { stdio: "ignore" },
    );

    const cdp = await connectCdp(debugPort);
    ws = cdp.ws;
    const { send, evalJs, sessionId } = cdp;

    await send(
      "Page.addScriptToEvaluateOnNewDocument",
      {
        source: `
          window.__smoke = { longTasks: [], fetches: 0, fetchLog: [] };
          new PerformanceObserver((list) => {
            for (const e of list.getEntries()) window.__smoke.longTasks.push(Math.round(e.duration));
          }).observe({ entryTypes: ["longtask"] });
          const orig = window.fetch;
          window.fetch = function (...a) {
            window.__smoke.fetches += 1;
            window.__smoke.fetchLog.push(String(a[0]));
            return orig.apply(this, a);
          };
          true;
        `,
      },
      sessionId,
    );

    console.log("=== skills-hub panel smoke ===");
    console.log("Chrome   " + chromePath);
    console.log("Sandbox  " + home);
    console.log("UI       " + panelUrl);
    console.log("");

    await send("Page.navigate", { url: panelUrl }, sessionId);
    const navReady = await (async () => {
      for (let i = 0; i < 80; i++) {
        const found = await evalJs(`(() => {
          const ids = ["nav-overview", "nav-stats", "nav-skills", "nav-settings"];
          return ids.every((id) => document.querySelector("[data-testid=" + id + "]"));
        })()`);
        if (found === true) return true;
        await sleep(250);
      }
      return false;
    })();
    if (navReady !== true) {
      console.error("找不到左侧三板块 + 设置导航。");
      return 1;
    }
    const tabErr = await openSkillsContentTab(evalJs);
    if (tabErr !== null) {
      console.error(tabErr);
      return 1;
    }
    let cards = 0;
    for (let i = 0; i < 80; i++) {
      cards = await evalJs("document.querySelectorAll('[data-testid=skill-card]').length");
      if (cards > 0) break;
      await sleep(250);
    }

    await evalJs("window.__smoke.longTasks = []; window.__smoke.fetches = 0; window.__smoke.fetchLog = []; true;");
    const tClick = Date.now();
    const clicked = await evalJs(`(() => {
      const b = document.querySelector('[data-testid=skill-card-open]');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (clicked !== true) {
      console.error("找不到 skill 卡片标题按钮,无法点开。");
      return 1;
    }

    let view = { hasMd: false, mdText: "", loadingText: "", snippet: "", onApps: false, onContent: false };
    for (let i = 0; i < 40; i++) {
      view = JSON.parse(
        await evalJs(`JSON.stringify((() => {
          const md = document.querySelector('[data-testid=skill-md]');
          const loading = document.querySelector('[data-testid=skill-loading]');
          const pane = document.querySelector('[data-testid=skills-content-pane]');
          const apps = document.querySelector('[data-testid=skills-apps-pane]');
          const mdText = md && md.innerText ? md.innerText : "";
          return {
            hasMd: !!(md && (md.childElementCount > 0 || mdText !== "")),
            mdText: mdText.slice(0, 240),
            loadingText: loading ? (loading.innerText || "") : "",
            onApps: !!apps,
            onContent: !!pane,
            snippet: mdText !== "" ? mdText.slice(0, 240) : (pane && pane.innerText ? pane.innerText.slice(0, 240) : ""),
          };
        })())`),
      );
      if (view.hasMd && view.mdText.includes(BODY_MARKER)) break;
      await sleep(100);
    }
    const elapsed = Date.now() - tClick;
    if (elapsed < CLICK_WINDOW_MS) await sleep(CLICK_WINDOW_MS - elapsed);

    const probe = JSON.parse(await evalJs("JSON.stringify(window.__smoke)"));
    const clickLongMax = probe.longTasks.length > 0 ? Math.max(...probe.longTasks) : 0;
    await evalJs(`(() => { const t = document.querySelector("[data-testid=skills-tab-apps]"); if (t) t.click(); return true; })()`);
    let switches = 0;
    for (let i = 0; i < 20; i++) {
      switches = await evalJs("document.querySelectorAll('[data-testid=client-switch]').length");
      if (switches > 0) break;
      await sleep(100);
    }
    await evalJs(`(() => {
      const nav = document.querySelector("[data-testid=nav-settings]");
      if (nav) nav.click();
      return true;
    })()`);
    let resetEntry = false;
    for (let i = 0; i < 20; i++) {
      resetEntry = await evalJs("!!document.querySelector('[data-testid=reset-button]')");
      if (resetEntry === true) break;
      await sleep(100);
    }

    await evalJs("window.__smoke.longTasks = []; window.__smoke.fetches = 0; true;");
    const idleStart = await metricsOf(send, sessionId);
    console.log("静置 10s 测 CPU 增量…");
    await sleep(IDLE_MS);
    const idleEnd = await metricsOf(send, sessionId);
    const idleCpu = idleEnd.taskDur - idleStart.taskDur;
    const idleProbe = JSON.parse(await evalJs("JSON.stringify(window.__smoke)"));
    const idleLongMax = idleProbe.longTasks.length > 0 ? Math.max(...idleProbe.longTasks) : 0;
    const longMax = Math.max(clickLongMax, idleLongMax);

    const loadingStuck = view.loadingText.includes("加载中") || view.snippet.includes("加载中…");
    const bodyOk = view.hasMd && view.mdText.includes(BODY_MARKER) && !loadingStuck && view.onContent && !view.onApps;
    let bodyHint = "";
    if (!bodyOk) {
      bodyHint = view.onApps
        ? "仍在应用 tab,内容查看器未打开"
        : loadingStuck
          ? "内容区仍为「加载中…」(B7-2 类回归)"
          : "内容区未出现正文(仍为「加载中…」或空白)";
    }

    console.log("--- 功能 ---");
    const r1 = line("卡片数", String(cards), String(EXPECTED_CARDS), cards === EXPECTED_CARDS, "列表未渲染出预期数量的卡片");
    const r2 = line(
      "内容区正文",
      bodyOk ? "含 " + BODY_MARKER : loadingStuck ? "「加载中…」" : JSON.stringify(view.snippet.slice(0, 80)),
      "出现正文,非「加载中…」",
      bodyOk,
      bodyHint,
    );
    const r3 = line(
      "客户端开关",
      String(switches),
      "> 0",
      switches > 0,
      "开关数为 0(B7-1 类回归:/api/clients 空或未渲染)",
    );
    const rNav = line(
      "设置重置入口",
      resetEntry === true ? "有按钮" : "无",
      "设置页有重置按钮",
      resetEntry === true,
      "左下角设置里没有重置入口",
    );

    console.log("--- 性能 ---");
    const r4 = line(
      "点击后 4s fetch",
      String(probe.fetches) + (probe.fetchLog.length > 0 ? " " + JSON.stringify(probe.fetchLog.slice(0, 6)) : ""),
      "≤ " + FETCH_MAX,
      probe.fetches <= FETCH_MAX,
      "点击后请求过多,疑似重复拉取",
    );
    const r5 = line(
      "静置 10s CPU 增量",
      idleCpu.toFixed(3) + " s" + (idleProbe.fetches > 0 ? " / fetch " + idleProbe.fetches : ""),
      "≤ " + IDLE_CPU_MAX_S + " s",
      idleCpu <= IDLE_CPU_MAX_S,
      "静置仍耗 CPU,疑似自激循环",
    );
    const r6 = line(
      "单个长任务",
      String(longMax) + " ms",
      "≤ " + LONG_TASK_MAX_MS + " ms",
      longMax <= LONG_TASK_MAX_MS,
      "存在超过 200ms 的长任务",
    );

    const pointerRaw = await readFile(path.join(home, ".skills-hub", "config.json"), "utf8");
    const storeRoot = JSON.parse(pointerRaw).storeRoot;
    if (typeof storeRoot !== "string" || storeRoot === "") {
      console.error("沙箱指针没有 storeRoot,无法做 1000 条规模断言。");
      return 1;
    }
    const coreHref = pathToFileURL(path.join(repo, "packages", "core", "dist", "index.js")).href;
    const { writeStoreIndex } = await import(coreHref);
    const scaleRecords = [];
    for (let i = 0; i < SCALE_COUNT; i++) {
      const name = "scale-" + String(i).padStart(4, "0");
      scaleRecords.push({
        hash: i.toString(16).padStart(64, "0"),
        dirName: name,
        meta: { name, description: "scale fixture " + i },
        origins: [{ kind: "local", reference: name }],
        visibleIn: [],
        installedAt: "2026-01-01T00:00:00.000Z",
      });
    }
    await writeStoreIndex(storeRoot, scaleRecords);
    await send("Page.reload", { ignoreCache: true }, sessionId);
    const scaleTabErr = await openSkillsContentTab(evalJs);
    if (scaleTabErr !== null) {
      console.error(scaleTabErr);
      return 1;
    }
    let scaleCards = 0;
    for (let i = 0; i < 80; i++) {
      scaleCards = await evalJs("document.querySelectorAll('[data-testid=skill-card]').length");
      if (scaleCards > 0) break;
      await sleep(250);
    }
    await sleep(400);
    scaleCards = await evalJs("document.querySelectorAll('[data-testid=skill-card]').length");
    const scaleApi = await (await fetch(panelUrl + "api/skills")).json();
    const scaleApiCount = Array.isArray(scaleApi.skills) ? scaleApi.skills.length : 0;
    const { metrics: scaleMetrics } = await send("Performance.getMetrics", {}, sessionId);
    const scaleNodes = scaleMetrics.find((m) => m.name === "Nodes")?.value ?? 0;

    console.log("--- 规模 ---");
    const r7 = line(
      "库存 1000 条",
      String(scaleApiCount),
      String(SCALE_COUNT),
      scaleApiCount === SCALE_COUNT,
      "规模库存未写入",
    );
    const r8 = line(
      "可见行(虚拟化)",
      String(scaleCards),
      "≤ " + RENDERED_CARD_MAX + " 且 > 0",
      scaleCards > 0 && scaleCards <= RENDERED_CARD_MAX,
      "未虚拟化:可见行接近全量",
    );
    const r9 = line(
      "文档 DOM 节点",
      String(Math.round(scaleNodes)),
      "≤ " + LIST_DOM_MAX,
      scaleNodes <= LIST_DOM_MAX,
      "1000 个 skill 时 DOM 超过 3000",
    );

    const checks = [r1, r2, r3, rNav, r4, r5, r6, r7, r8, r9];
    const passed = checks.filter(Boolean).length;
    console.log("");
    console.log("结果: " + passed + "/" + checks.length + " " + (passed === checks.length ? "通过" : "未通过"));
    ws.close();
    return passed === checks.length ? 0 : 1;
  } finally {
    if (ws !== undefined) {
      try {
        ws.close();
      } catch {
        /* 已关 */
      }
    }
    stopChild(chrome);
    stopChild(ui);
    await sleep(300);
    for (const dir of trash) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

const code = await main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  return 1;
});
process.exit(code);
