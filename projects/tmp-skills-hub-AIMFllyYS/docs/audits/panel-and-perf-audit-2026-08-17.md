# 面板与性能实测审计(2026-08-17)

> 状态:结论生效,作为批 7 全部 P0 issue 的事实依据
> 触发:用户报告「在 Web 壳点击任何一个 skill,电脑非常非常卡,疑似严重递归」
> 方法:不靠读代码猜,全部指标用真实进程 + 真实浏览器(Chrome DevTools Protocol)量出来
> 探针脚本:`.sandbox/cdp-probe.mjs`、`.sandbox/cdp-probe2.mjs`(一次性诊断工具,不进产物)

## 0. 一句话结论

**卡顿不是点击造成的,Web 应用里没有任何死循环或递归。** 点击一个 skill 的真实代价是
20–45ms 服务端 + 100–250ms 浏览器渲染。整机卡顿的真凶是**同一条命令(`bootstrap`)的备份阶段
单次写入 473 MB / 读取 846 MB**,而它恰好在备份完成后自动打开面板——用户看到的是「面板一打开、
一点就卡」,归因错了一层。

同时实测暴露了两个让面板「看起来没功能」的真 bug:**所有客户端开关消失**、**内容区永远停在
「加载中…」**。这两个才是用户体感「壳」的直接原因,优先级高于任何新功能。

## 1. 实测环境与基线

| 项 | 值 |
| --- | --- |
| 库存根 | `D:\projects\My-Skills\Hubs`(指针 `~/.skills-hub/config.json`) |
| 库存规模 | 157 个 skill / 2547 个文件 / `index.json` 166 KB |
| `links.json` | **3 字节(`[]`)——一条链接都没有** |
| 客户端 root(正确 home 下发现) | **23 个** |
| 占用 4321 端口的进程 | PID 9116 = `node packages/cli/dist/index.js bootstrap`,启动 08:40:30,**至今未退出** |

> 注:因为端口被用户那次 `bootstrap` 占着,本次探针实际测到的**就是用户当时在看的那个面板进程**,
> 不是我另起的干净实例。这一点让证据更硬。

## 2. 服务端:全部端点都快,没有热点

单次请求耗时(`Invoke-WebRequest`,本机回环):

| 端点 | 耗时 | 响应体 |
| --- | --- | --- |
| `/api/health` | 132 ms(含首次 JIT) | 11 B |
| `/api/skills` | 153 ms | 129 KB |
| `/api/clients` | 17 ms | **44 B** ← 见 §4.1 |
| `/api/stats` | 19 ms | 78 B |
| `/api/archive` | 15 ms | 113 B |
| `/api/groups` | 18 ms | 511 B |
| `/api/skills/:hash/tree` × 8 | 14–37 ms | 143 B – 5.3 KB |
| `/api/skills/:hash/file?path=SKILL.md` × 8 | 19–45 ms | 1.8 – 32 KB |

`listSkillFiles` 的递归遍历用 `lstat`(不跟随链接),`MAX_TREE_ENTRIES=500` 上限有效,
库存里平均 16 个文件/skill,**不存在遍历爆炸**。

## 3. 浏览器:没有死循环,渲染代价可接受

### 3.1 构建版面板(`http://127.0.0.1:4321/`)

| 场景 | 结果 |
| --- | --- |
| 首屏(到列表出现) | 1526 ms,157 张卡片,DOM 2976 节点,堆 5.1 MB,长任务 `[71ms]` |
| 点击一个 skill | **fetch 1 次**(只有 `/tree`),长任务 `[]`,DOM +19,堆 +0.2 MB,CPU +0.03 s |
| 点击后静置 10 s | **fetch 0 次,长任务 0 个,CPU 增量 0.00 s,DOM/堆零增长** |
| 连续展开 20 个 | 6.0 s 内 fetch 19 次,长任务 `[]`,CPU +0.08 s |
| 展开全部 157 个 | DOM 6916 → 16032,堆 8.3 → 11.8 MB,CPU +0.58 s,长任务 `[]` |

「静置 10 s 零消耗」这一项直接排除了轮询、`useEffect` 自激、无限重渲染这一整类假设。

### 3.2 完整路径(点开卡片 → 再点树里的 `SKILL.md`,内容真正渲染)

| skill | 树条目 | 点开卡片 | 渲染内容 | DOM 增量 | 堆增量 | CPU 增量 | 长任务 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `agent_management`(58 KB) | 1 | 177 ms | 250 ms | 3648 | 5.5 MB | 0.24 s | `[93ms]` |
| `highcharts`(36 KB) | 26 | 164 ms | 120 ms | 6351 | 2.0 MB | 0.12 s | `[52ms]` |
| `agent-browser` | 11 | 166 ms | 120 ms | 1842 | 1.4 MB | 0.04 s | `[]` |
| `lark-base` | 32 | 164 ms | 122 ms | 2025 | 1.0 MB | 0.06 s | `[]` |

最差一档(58 KB Markdown → 82 KB HTML)也只有 250 ms 和一个 93 ms 长任务。
另外单独量过 `marked + highlight.js` 管线:157 个 `SKILL.md` **全部解析合计 389 ms**,
最慢单个 37 ms。**Markdown 渲染不是瓶颈。**

### 3.3 Vite dev(`localhost:5174`)

结论同上(CPU 静置增量 0.00 s),唯一差异:**每次点击发两次 `/tree` 请求**——
React StrictMode 在 dev 下双调用 effect。无害,但说明请求层没有去重/取消。

## 4. 实测暴露的四个真 bug

### 4.1 P0:`bootstrap` 把 storeRoot 当 home 传进 UI 服务 → 所有开关消失

`packages/cli/src/bootstrap.ts:226`

    await startUiServer(port, storeRoot);

`startUiServer(port, home)` 的第二个参数是**客户端发现的 home 基座**,不是库存根。传进
`D:\projects\My-Skills\Hubs` 后,`discoverClientRoots` 去找 `Hubs/<x>/skills`,一个也找不到:

- `/api/clients` 返回 `{"clients":[]}`(44 字节,实测)
- `SkillCard` 按 `clients.map` 渲染开关 → **每张卡片的 enable/disable 开关全部为空**
- 面板于是只剩「看」,管理动作一个都点不到 → 这就是「面板是个壳」的最直接来源

同一函数在幂等分支(`bootstrap.ts:177`)传的是 `base`,是对的——**只有首次 bootstrap 这条路径错**,
所以越是新用户第一次用,面板越残。直接用正确 home 调用 `discoverClientRoots` 实测返回 23 个 root,
发现逻辑本身没问题。

### 4.2 P0:内容区永远停在「加载中…」

`apps/web/src/features/skills/SkillViewer.tsx`:挂载时的 `useEffect` 只拉**文件树**,
设好 `selected = "SKILL.md"` 就结束,**从不调用 `load(selected)` 去取内容**。`load` 只挂在
文件树按钮的 `onClick` 上。于是:

- `content` 恒为 `""` → `html` 恒为 `""` → 命中 `content === "" && <p>加载中…</p>` 分支
- CDP 实测右栏文本 = `"加载中…"`,静置 10 s 不变

用户点开一个 skill 看到「加载中…」不动,自然判定为「卡死」。**这是体感 bug 的核心。**

### 4.3 P0:备份放大 —— 整机卡顿的真凶

| 证据 | 值 |
| --- | --- |
| `bootstrap` 进程累计 I/O | **读 846 MB / 写 473 MB** |
| 快照 `2026-08-16T19-30-35`(旧代码) | 521 文件 / 5.0 MB |
| 快照 `2026-08-16T19-40-41`(现行代码) | **13721 文件 / 308.8 MB** |

两次快照相隔 10 分钟,体积放大 **26 倍**。原因是 `copyTree` 改成**跟随符号链接复制内容**
(commit d1b7d94,为解决悬空链接与 Windows symlink 提权而做的正确修复),但没有配套去重:
23 个客户端 root 里指向**同一份库存 skill** 的 junction,现在每个 root 都完整复制一遍内容。
N 个客户端 × 同一份内容 = N 倍写入。

473 MB 单线程递归写入 + Windows Defender 逐文件扫描,足以让整机卡到不能用几分钟。
而 `bootstrap` 备份完就 `openBrowser` 自动打开面板,用户此刻正好在点 skill —— 归因错了一层。

### 4.4 P0:备份目录被当成客户端 root → 复合增长

`~/.skills-hub.pre-bootstrap-20260817T082919/` 下有 `skills/`,于是被 `discoverClientRoots`
识别成一个 clientId 叫 `skills-hub.pre-bootstrap-20260817T082919` 的**客户端**(实测出现在 23 个
root 列表里)。后果:

- 下次备份会把**上次的备份**再备一遍 → 每跑一次 bootstrap 体积复合增长
- `migrateAllSkills` 会把备份里的 skill 当新发现再收录一遍(靠哈希去重兜住,但统计与来源被污染)
- 同理:默认库存位置是 `~/.skills-hub`,一旦 `init` 在那里建出 `skills/`,
  **库存自己就会被发现成客户端**,自我备份、自我收录

`discoverClientRoots` 是纯形状扫描(见 [client-skills-directories-2026-08-16.md](client-skills-directories-2026-08-16.md)),
本身没错;错在**没有把「本项目自己的目录」排除在外**。

## 5. 不是 bug,但面板要当主操作台就会痛

| 现象 | 实测数据 | 影响 |
| --- | --- | --- |
| 157 张卡片一次性全渲染,无虚拟化、无 `memo` | 全展开 DOM 16032 节点 | 现在能扛;上千 skill 时不行 |
| 卡片内联展开查看器(手风琴) | 每展开一张 +1000~6000 DOM | 内容区被挤在 `max-h-96` 里,读长文档很难受 |
| `SkillCard` 每次父级重渲染都重建 23 个开关闭包 | — | 任一全局状态变化都重算全表 |
| dev 下点击双发请求 | fetch ×2 | 请求层缺去重/取消 |
| 每次写操作后整表重拉(`setReload`) | `/api/skills` 129 KB | 批量操作会变成 N 次全量重拉 |

这些是**架构层面的**,靠打补丁不解决,属于批 8 的信息架构重构。

## 6. 复现方式

    # 服务端计时
    node packages/cli/dist/index.js ui        # 或用已在跑的实例
    # 浏览器侧(需要本机 Chrome)
    node .sandbox/cdp-probe.mjs  http://127.0.0.1:4321/
    node .sandbox/cdp-probe2.mjs http://127.0.0.1:4321/
    # 正式冒烟(沙箱库存,不依赖本机真实库存): pnpm smoke  → scripts/smoke-panel.mjs (#100)

判定口径:
- 「静置 10 s 的 CPU 增量」> 0.1 s 即认为存在自激循环
- 「点击后 4 s 内 fetch 数」> 2 即认为存在请求风暴
- 单个长任务 > 200 ms 即认为渲染需要拆分
